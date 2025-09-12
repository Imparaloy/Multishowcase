(function(){
  const openBtn   = document.getElementById('editProfileBtn');
  const modal     = document.getElementById('editProfileModal'); // ให้ id ตรงกับตอน include
  if (!openBtn || !modal) return;

  const cancelBtn = modal.querySelector('[data-cancel]');
  const saveBtn   = modal.querySelector('[data-save]');
  const backdrop  = modal.querySelector('[data-backdrop]');
  const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
  let lastFocused = null;

  function openModal(){
    lastFocused = document.activeElement;
    modal.classList.remove('hidden');
    document.documentElement.style.overflow = 'hidden';
    const first = modal.querySelector(FOCUSABLE);
    first && first.focus();
  }
  function closeModal(){
    modal.classList.add('hidden');
    document.documentElement.style.overflow = '';
    lastFocused && lastFocused.focus();
  }
  function trapTab(e){
    if(e.key!=='Tab') return;
    const nodes = [...modal.querySelectorAll(FOCUSABLE)].filter(el=>!el.disabled && el.offsetParent!==null);
    if(!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length-1];
    if(e.shiftKey && document.activeElement===first){ last.focus(); e.preventDefault(); }
    else if(!e.shiftKey && document.activeElement===last){ first.focus(); e.preventDefault(); }
  }

  openBtn.addEventListener('click', openModal);
  cancelBtn && cancelBtn.addEventListener('click', closeModal);
  backdrop  && backdrop .addEventListener('click', closeModal);
  saveBtn   && saveBtn   .addEventListener('click', (e)=>{ e.preventDefault(); /* submit ได้ตามต้องการ */ closeModal(); });
  window.addEventListener('keydown', e => { if(!modal.classList.contains('hidden') && e.key==='Escape') closeModal(); });
  modal.addEventListener('keydown', trapTab);
})();
