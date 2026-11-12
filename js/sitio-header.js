(() => {
  const raiz = document.documentElement;
  document.getElementById('sitio-tema').addEventListener('click', () => {
    const oscuro = raiz.classList.toggle('dark');
    try {
      localStorage.setItem('theme', oscuro ? 'dark' : 'light');
    } catch {
      /* sin almacenamiento: el tema solo dura esta visita */
    }
  });

  const boton = document.getElementById('sitio-menu');
  const menu = document.getElementById('sitio-movil');
  boton.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    boton.setAttribute('aria-expanded', String(!menu.hidden));
  });
})();
