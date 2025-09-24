document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const messageDiv = document.getElementById('form-message');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Previene el envío tradicional
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      // Intento de autenticación
      await auth.signInWithEmailAndPassword(email, password);
      
      // Redirección exitosa
      window.location.href = "index.html";
    } catch (error) {
      // Manejo detallado de errores
      const errorMsg = {
        'auth/invalid-email': 'Correo electrónico inválido',
        'auth/user-not-found': 'Usuario no registrado',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.'
      };
      
      messageDiv.textContent = errorMsg[error.code] || "Error al iniciar sesión";
      messageDiv.style.display = 'block';
    }
  });
});
