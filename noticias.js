async function cargarNoticias() {
  try {
    const res = await fetch("backend/noticias.php");
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    let html = "";
    data.noticias.forEach(n => {
      html += `
        <div class="noticia-card">
          <h3>${n.titulo}</h3>
          <p>${n.descripcion}</p>
          <a href="${n.link}" target="_blank">Ver completa</a>
        </div>`;
    });

    document.getElementById("noticias").innerHTML = html;
  } catch (e) {
    document.getElementById("noticias").innerHTML =
      "<p style='color:red;'>No se pudieron cargar las noticias</p>";
  }
}
