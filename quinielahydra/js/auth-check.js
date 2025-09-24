// Verifica autenticación al cargar cada página
auth.onAuthStateChanged((user) => {
  const currentPage = window.location.pathname.split('/').pop();
  
  if (!user && currentPage !== 'login.html') {
    window.location.href = 'login.html';
  }
  
  if (user && currentPage === 'login.html') {
    window.location.href = 'index.html';
  }
});
