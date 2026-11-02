import { createClient } from '@supabase/supabase-js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const apiOrigin = new URL(window.SALTY_DOG_API_ORIGIN).origin;
let auth, config, actor, dogs=[], editing=null, photos=[], dirty=false, saving=false;
let factors=[], loginChallenge=null, pendingFactor=null;
const localPhotos=new Map();
function notice(message='', error=false) {
  $('#notice').textContent=message;
  $('#notice').classList.toggle('error',error);
}
function showPage(id) {
  for(const selector of ['#login-view','#mfa-view','#password-view','#workspace']) $(selector).hidden=selector!==id;
}
function photoURL(photo) { return localPhotos.get(photo) || new URL(photo, apiOrigin).href; }
function releasePhotos() { for(const url of localPhotos.values()) URL.revokeObjectURL(url); localPhotos.clear(); }
function apiError(data,status) {
  if(data.error==='MFA_REQUIRED') return new Error('Please complete two-step verification before continuing.');
  if(data.error==='PASSWORD_CHANGE_REQUIRED') return new Error('Choose your own password in My account before continuing.');
  return new Error(data.error || `The request could not be completed (${status}).`);
}
async function api(path, {method='GET',body,raw=false}={}) {
  const {data:{session}}=await auth.auth.getSession();
  if(!session) throw new Error('Please sign in again.');
  const response=await fetch(`${apiOrigin}/api/cms/${path}`,{
    method,
    headers:{Authorization:`Bearer ${session.access_token}`,...(!raw&&body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:raw?body:JSON.stringify(body)}:{}),
  });
  const data=await response.json();
  if(!response.ok) throw apiError(data,response.status);
  return data;
}
async function busy(form, task) {
  const buttons=[...form.querySelectorAll('button')];
  buttons.forEach(button=>button.disabled=true);
  try { await task(); } catch(error) { notice(error.message,true); }
  finally { buttons.forEach(button=>button.disabled=false); }
}
async function loadSession() {
  const {data:{session}}=await auth.auth.getSession();
  if(!session) {actor=null;$('#signed-in').hidden=true;showPage('#login-view');return;}
  const {data:factorData,error:factorError}=await auth.auth.mfa.listFactors();
  if(factorError) throw factorError;
  factors=(factorData.all||[]).filter(f=>f.status==='verified');
  const {data:level,error:levelError}=await auth.auth.mfa.getAuthenticatorAssuranceLevel();
  if(levelError) throw levelError;
  if(factors.length&&level.currentLevel!=='aal2') {
    $('#mfa-factor').innerHTML=factors.map(f=>`<option value="${escape(f.id)}">${escape(f.factor_type==='phone'?'Text message':'Authenticator app')}${f.friendly_name?' · '+escape(f.friendly_name):''}</option>`).join('');
    loginChallenge=null;$('#mfa-code').value='';updateMfaInstructions();showPage('#mfa-view');return;
  }
  actor=(await api('me')).user;
  $('#signed-in').hidden=false;
  $('#account-label').textContent=`${actor.name} · ${actor.role==='superuser'?'Superuser':'Regular user'}`;
  if(actor.must_change_password) {showPage('#password-view');return;}
  $('#users-nav').hidden=actor.role!=='superuser';
  showPage('#workspace');
  await showView('dogs');
}
async function showView(view) {
  if(dirty&&!confirm('You have unsaved changes. Discard them?')) return;
  dirty=false;
  for(const name of ['dogs','editor','users','account']) $(`#${name}-view`).hidden=name!==view;
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-current',button.dataset.view===view?'page':'false'));
  if(view==='dogs') {dogs=(await api('dogs')).dogs;renderDogs();}
  if(view==='users') await renderUsers();
  if(view==='account') await renderFactors();
}
function renderDogs() {
  const query=$('#dog-search').value.toLocaleLowerCase();
  const visible=dogs.filter(dog=>`${dog.name} ${dog.breed}`.toLocaleLowerCase().includes(query));
  $('#dog-list').innerHTML=visible.length?visible.map(dog=>`<article class="dog-row">
    <img src="${escape(photoURL(dog.photos[0]))}" alt="${escape(dog.name)}">
    <div><span class="badge ${dog.status==='adopted'?'adopted':''}">${dog.deleted_at?'Deleted':dog.status==='adopted'?'Adopted':'Available'}</span><h2>${escape(dog.name)}</h2><p class="muted">${escape(dog.breed)}</p></div>
    <div class="row-actions">${dog.deleted_at?`<button type="button" data-restore="${escape(dog.id)}" class="quiet">Restore profile</button>`:`<button type="button" data-edit="${escape(dog.id)}">Edit profile</button>${actor.role==='superuser'?`<button type="button" data-delete="${escape(dog.id)}" class="quiet">Delete</button>`:''}`}</div>
  </article>`).join(''):'<p class="card">No profiles found. Use “Add a dog” to create one.</p>';
}
async function editDog(dog=null) {
  if(dirty&&!confirm('Discard your unsaved changes?')) return;
  dirty=false;await showView('editor');
  releasePhotos();editing=dog;photos=dog?[...dog.photos]:[];
  const form=$('#dog-form');form.reset();
  for(const field of ['name','breed','age','description']) form.elements[field].value=dog?.[field]||'';
  for(const field of ['good_dogs','good_small_animals','gentle_children']) form.elements[field].checked=!!dog?.[field];
  if(dog) form.elements.sex.value=dog.sex;
  form.elements.status.value=dog?.status||'available';
  $('#editor-title').textContent=dog?`Edit ${dog.name}`:'Add a dog';
  $('#profile-preview').hidden=true;
  updateWords();renderPhotos();
  form.elements.name.focus();
}
function formDog() {
  const f=$('#dog-form').elements;
  return {name:f.name.value.trim(),breed:f.breed.value.trim(),sex:f.sex.value,age:f.age.value.trim(),status:f.status.value,description:f.description.value.trim(),good_dogs:f.good_dogs.checked,good_small_animals:f.good_small_animals.checked,gentle_children:f.gentle_children.checked,photos:[...photos],...(editing?{version:editing.version}:{})};
}
function updateWords() {
  const count=$('#dog-form').elements.description.value.trim().split(/\s+/u).filter(Boolean).length;
  $('#word-count').textContent=`${count.toLocaleString()} / 1,000 words`;
  $('#word-count').classList.toggle('over-limit',count>1000);
  $('#dog-form').elements.description.setCustomValidity(count>1000?'Shorten the description to 1,000 words or fewer.':'');
}
function renderPhotos() {
  $('#photo-list').innerHTML=photos.map((photo,index)=>`<div class="photo-tile"><img src="${escape(photoURL(photo))}" alt="Profile photo ${index+1}"><button type="button" class="quiet" data-cover="${index}"${index===0?' disabled':''}>${index===0?'✓ Main photo':'Make main photo'}</button><button type="button" class="quiet" data-remove-photo="${index}">Remove photo</button></div>`).join('');
}
function validateForm() {
  updateWords();
  if(!$('#dog-form').reportValidity()) return false;
  if(!photos.length) {notice('Please add at least one photo.',true);return false;}
  return true;
}
function renderPreview() {
  const d=formDog();
  const tags=[d.good_dogs&&'Good with other dogs',d.good_small_animals&&'Good with cats/small animals',d.gentle_children&&'Gentle with children'].filter(Boolean);
  $('#preview-card').innerHTML=`<article class="preview-card"><div class="preview-image"><img src="${escape(photoURL(d.photos[0]))}" alt="${escape(d.name)}">${d.status==='adopted'?'<span class="adopted-overlay">ADOPTED</span>':''}</div><div class="preview-copy"><span class="badge ${d.status==='adopted'?'adopted':''}">${d.status==='adopted'?'Adopted':'Available'}</span><h3>${escape(d.name)}</h3><p>${escape([d.age,d.sex,d.breed].filter(Boolean).join(' · '))}</p><p class="description">${escape(d.description)}</p>${tags.map(tag=>`<span class="badge">${escape(tag)}</span>`).join(' ')}</div></article>`;
  $('#profile-preview').hidden=false;
}
async function confirmAction(title,description,expected='') {
  $('#confirm-title').textContent=title;$('#confirm-description').textContent=description;
  $('#confirm-label').hidden=!expected;$('#confirm-input').value='';
  $('#confirm-button').disabled=!!expected;
  $('#confirm-input').oninput=()=>{$('#confirm-button').disabled=$('#confirm-input').value!==expected;};
  const dialog=$('#confirm-dialog');dialog.returnValue='';dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
function updateMfaInstructions() {
  const factor=factors.find(f=>f.id===$('#mfa-factor').value);
  const phone=factor?.factor_type==='phone';
  $('#mfa-instructions').textContent=phone?'Send a text message, then enter the code you receive.':'Enter the current six-digit code from your authenticator app.';
  $('#send-sms').hidden=!phone;loginChallenge=null;
}
async function renderFactors() {
  const {data,error}=await auth.auth.mfa.listFactors();if(error) throw error;
  const verified=(data.all||[]).filter(f=>f.status==='verified');
  $('#factor-list').innerHTML=verified.length?verified.map(f=>`<p><span class="badge">Enabled</span> ${escape(f.factor_type==='phone'?'Text message':'Authenticator app')} <button type="button" class="quiet" data-unenroll="${escape(f.id)}">Remove</button></p>`).join(''):'<p class="muted">Two-step verification is currently off.</p>';
  $('#enroll-totp').hidden=verified.some(f=>f.factor_type==='totp');
  $('#sms-enroll').hidden=!config.smsMfaEnabled||verified.some(f=>f.factor_type==='phone');
}
async function enroll(factorType,phone) {
  if(pendingFactor) await cancelFactor();
  const {data:listed,error:listError}=await auth.auth.mfa.listFactors();if(listError) throw listError;
  for(const f of listed.all||[]) if(f.status==='unverified') await auth.auth.mfa.unenroll({factorId:f.id});
  const {data,error}=await auth.auth.mfa.enroll({factorType,...(phone?{phone}:{}),friendlyName:factorType==='totp'?'Salty Dog authenticator':'Salty Dog text messages',issuer:'Salty Dog Rescue'});
  if(error) throw error;
  pendingFactor={id:data.id,type:factorType,challenge:null};
  $('#qr-code').replaceChildren();$('#factor-secret').textContent='';
  if(factorType==='totp') {
    const image=document.createElement('img');image.alt='Scan with your authenticator app';image.src=data.totp.qr_code;
    $('#qr-code').append(image);$('#factor-secret').textContent=`Manual setup key: ${data.totp.secret}`;
  } else {
    const {data:challenge,error:challengeError}=await auth.auth.mfa.challenge({factorId:data.id});if(challengeError) throw challengeError;
    pendingFactor.challenge=challenge.id;$('#factor-secret').textContent='Enter the code sent to your phone.';
  }
  $('#verify-factor').reset();$('#factor-setup').hidden=false;
}
async function cancelFactor() {
  if(pendingFactor) {const {error}=await auth.auth.mfa.unenroll({factorId:pendingFactor.id});if(error) throw error;}
  pendingFactor=null;$('#factor-setup').hidden=true;$('#qr-code').replaceChildren();$('#factor-secret').textContent='';
}
async function renderUsers() {
  if(actor.role!=='superuser') throw new Error('Only a superuser can manage accounts.');
  const {users}=await api('users');
  $('#user-list').innerHTML=users.map(user=>`<article class="card"><div class="user-heading"><h2>${escape(user.name)}</h2><span class="badge">${user.active?'Active':'Disabled'}</span></div><p>${escape(user.email)}</p>${user.id===actor.id?'<p class="muted">This is your account. Ask another superuser to change your access.</p>':`<form data-user="${escape(user.id)}"><label>Display name<input name="name" value="${escape(user.name)}" maxlength="100" required></label><label>Role<select name="role"><option value="editor"${user.role==='editor'?' selected':''}>Regular user</option><option value="superuser"${user.role==='superuser'?' selected':''}>Superuser</option></select></label><label class="choice"><input type="checkbox" name="active"${user.active?' checked':''}>Account enabled</label><button>Save account</button></form><details><summary>Reset password</summary><form data-reset-user="${escape(user.id)}"><label>New temporary password<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><p class="muted">Give this to the account owner privately. Their MFA remains enabled.</p><button>Set temporary password</button></form></details>`}</article>`).join('');
}
function bindForm(id,task) {$(id).addEventListener('submit',event=>{event.preventDefault();busy(event.currentTarget,()=>task(event.currentTarget));});}
bindForm('#login-form',async form=>{
  notice('Signing in…');const {error}=await auth.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value});
  form.elements.password.value='';if(error) throw new Error('Sign-in failed. Check your email and password.');
  await loadSession();notice('');
});
bindForm('#mfa-login',async()=>{
  const factor=factors.find(f=>f.id===$('#mfa-factor').value);
  const code=$('#mfa-code').value;
  const result=factor.factor_type==='phone'
    ? loginChallenge?await auth.auth.mfa.verify({factorId:factor.id,challengeId:loginChallenge,code}):{error:new Error('Send a text message first.')}
    : await auth.auth.mfa.challengeAndVerify({factorId:factor.id,code});
  if(result.error) throw new Error('Verification failed. Check the code and try again.');
  $('#mfa-code').value='';await loadSession();notice('');
});
$('#mfa-factor').addEventListener('change',updateMfaInstructions);
$('#send-sms').addEventListener('click',()=>busy($('#mfa-login'),async()=>{
  const {data,error}=await auth.auth.mfa.challenge({factorId:$('#mfa-factor').value});if(error) throw error;
  loginChallenge=data.id;notice('Verification code sent.');
}));
async function logout() {
  if(dirty&&!confirm('Discard unsaved changes and sign out?')) return;
  dirty=false;releasePhotos();const {error}=await auth.auth.signOut({scope:'local'});if(error) throw error;
  actor=null;$('#signed-in').hidden=true;showPage('#login-view');notice('You are signed out.');
}
$('#logout').addEventListener('click',()=>logout().catch(error=>notice(error.message,true)));
$('.cancel-login').addEventListener('click',()=>logout().catch(error=>notice(error.message,true)));
async function savePassword(form,required) {
  if(form.elements.password.value!==form.elements.confirmation.value) throw new Error('The passwords do not match.');
  await api('password',{method:'POST',body:{password:form.elements.password.value}});form.reset();
  if(required) await loadSession();notice('Your password has been updated.');
}
bindForm('#required-password',form=>savePassword(form,true));
bindForm('#change-password',form=>savePassword(form,false));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view).catch(error=>notice(error.message,true))));
$('#add-dog').addEventListener('click',()=>editDog().catch(error=>notice(error.message,true)));
for(const id of ['#back-to-dogs','#cancel-edit']) $(id).addEventListener('click',()=>showView('dogs').catch(error=>notice(error.message,true)));
$('#dog-search').addEventListener('input',renderDogs);
$('#dog-form').addEventListener('input',()=>{dirty=true;updateWords();});
$('#preview-dog').addEventListener('click',()=>{if(validateForm()) renderPreview();});
$('#photo-upload').addEventListener('change',event=>busy($('#dog-form'),async()=>{
  const files=[...event.target.files];event.target.value='';
  if(files.length+photos.length>12) throw new Error('Choose up to 12 photos in total.');
  saving=true;
  try {
    for(const file of files) {
      if(file.size>8*1024*1024) throw new Error(`${file.name} is larger than 8 MB.`);
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose JPEG, PNG, or WebP photos.');
      try { const image = await createImageBitmap(file); image.close(); } catch { throw new Error(`${file.name} could not be opened as a photo. Choose another file.`); }
      notice(`Uploading ${file.name}…`);
      const {photo}=await api('photos',{method:'POST',body:file,raw:true});
      localPhotos.set(photo,URL.createObjectURL(file));photos.push(photo);dirty=true;renderPhotos();
    }
    notice('Photos uploaded. Save the profile to publish them.');
  } finally {saving=false;}
}));
$('#photo-list').addEventListener('click',event=>{
  const cover=event.target.closest('[data-cover]');const remove=event.target.closest('[data-remove-photo]');
  if(cover){const index=Number(cover.dataset.cover);photos.unshift(...photos.splice(index,1));dirty=true;renderPhotos();}
  if(remove){photos.splice(Number(remove.dataset.removePhoto),1);dirty=true;renderPhotos();}
});
bindForm('#dog-form',async()=>{
  if(saving||!validateForm()) return;
  saving=true;
  try {
    await api(editing?`dogs/${editing.id}`:'dogs',{method:editing?'PUT':'POST',body:formDog()});
    dirty=false;releasePhotos();await showView('dogs');notice('Profile saved. The public website will show this update on its next load.');
  } finally {saving=false;}
});
$('#dog-list').addEventListener('click',event=>{
  const edit=event.target.closest('[data-edit]');const del=event.target.closest('[data-delete]');const restore=event.target.closest('[data-restore]');
  if(edit) editDog(dogs.find(d=>d.id===edit.dataset.edit)).catch(error=>notice(error.message,true));
  if(del||restore) {
    const dog=dogs.find(d=>d.id===(del?.dataset.delete||restore.dataset.restore));
    (async()=>{
      if(!await confirmAction(`${restore?'Restore':'Delete'} ${dog.name}?`,restore?'This profile will appear on the public website again.':'This removes the profile from the public website. A superuser can restore it later.',dog.name)) return;
      await api(`dogs/${dog.id}${restore?'/restore':''}`,{method:restore?'POST':'DELETE',body:{confirmName:dog.name,version:dog.version}});
      await showView('dogs');notice(restore?'Profile restored.':'Profile deleted. You can restore it from this list.');
    })().catch(error=>notice(error.message,true));
  }
});
bindForm('#add-user',async form=>{
  await api('users',{method:'POST',body:Object.fromEntries(new FormData(form))});form.reset();await renderUsers();notice('Account created. Share its temporary password privately with the account owner.');
});
$('#user-list').addEventListener('submit',event=>{
  const form=event.target;event.preventDefault();
  busy(form,async()=>{
    if(form.dataset.user) await api(`users/${form.dataset.user}`,{method:'PUT',body:{name:form.elements.name.value,role:form.elements.role.value,active:form.elements.active.checked}});
    if(form.dataset.resetUser) {await api(`users/${form.dataset.resetUser}/reset-password`,{method:'PUT',body:{password:form.elements.password.value}});form.reset();}
    await renderUsers();notice('Account updated.');
  });
});
$('#enroll-totp').addEventListener('click',()=>enroll('totp').catch(error=>notice(error.message,true)));
bindForm('#sms-enroll',async form=>{await enroll('phone',form.elements.phone.value.trim());});
$('#cancel-factor').addEventListener('click',()=>cancelFactor().catch(error=>notice(error.message,true)));
bindForm('#verify-factor',async form=>{
  if(!pendingFactor) return;
  const {id,type,challenge}=pendingFactor;
  const {error}=type==='phone'?await auth.auth.mfa.verify({factorId:id,challengeId:challenge,code:form.elements.code.value}):await auth.auth.mfa.challengeAndVerify({factorId:id,code:form.elements.code.value});
  if(error) throw new Error('That code could not be verified. Try a fresh code.');
  pendingFactor=null;form.reset();$('#factor-setup').hidden=true;$('#qr-code').replaceChildren();$('#factor-secret').textContent='';
  await renderFactors();notice('Two-step verification is enabled.');
});
$('#factor-list').addEventListener('click',event=>{
  const button=event.target.closest('[data-unenroll]');if(!button) return;
  (async()=>{if(!await confirmAction('Remove two-step verification?','You will use only your password to sign in unless another method remains enabled.')) return;const {error}=await auth.auth.mfa.unenroll({factorId:button.dataset.unenroll});if(error) throw error;await renderFactors();notice('Verification method removed.');})().catch(error=>notice(error.message,true));
});
window.addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
async function start() {
  const response=await fetch(`${apiOrigin}/api/cms/config`);
  config=await response.json();if(!response.ok) throw apiError(config,response.status);
  auth=createClient(config.supabaseUrl,config.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'salty-dog-cms-auth'}});
  await loadSession();notice('');
}
start().catch(error=>notice(`${error.message} If setup is still in progress, contact the portal administrator.`,true));
