(() => {
  const element=document.getElementById('login'),status=document.getElementById('status');
  let stopped=false,timer;
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);});
  async function poll() {
    try {
      const response=await fetch('/interaction/'+encodeURIComponent(element.dataset.uid)+'/status',{credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(!response.ok)throw Error('La sessione non è più disponibile. Avvia un nuovo accesso.');
      const result=await response.json();if(stopped)return;
      if(result.status==='verified'){stopped=true;status.textContent='Credenziale verificata. Accesso in corso…';document.getElementById('complete').submit();return;}
      if(result.status==='failed'){stopped=true;status.textContent=result.message||'Verifica rifiutata o scaduta.';return;}
      timer=setTimeout(poll,800);
    }catch{if(!stopped){stopped=true;status.textContent='Verifica non completata. Controlla la connessione e avvia un nuovo accesso dal client.';}}
  }
  poll();
})();
