async function cargarNoticias() {
    try {
        const res = await fetch("api.php?accion=noticias");
        const noticias = await res.json();
        let html = "";

        noticias.forEach(n => {
            html += `
            <div style="margin-bottom:15px;">
                <h3>${n.title}</h3>
                ${n.image ? `<img src="${n.image}" style="width:100%;max-width:300px;">` : ""}
                <p><a href="${n.link}" target="_blank">Ver noticia completa</a></p>
            </div><hr>`;
        });

        document.getElementById("noticias").innerHTML = html;
    } catch(err) {
        console.error("Error cargando noticias:", err);
        document.getElementById("noticias").innerHTML = "<p>No se pudieron cargar noticias.</p>";
    }
}

async function cargarTabla() {
    try {
        const res = await fetch("api.php?accion=tabla");
        const tabla = await res.json();
        const tbody = document.querySelector("#tablaGeneral tbody");
        tbody.innerHTML = "";

        tabla.forEach(t => {
            tbody.innerHTML += `
            <tr>
                <td>${t.pos}</td>
                <td style="display:flex;align-items:center;gap:5px;">
                    ${t.logo ? `<img src="${t.logo}" width="20">` : ""} ${t.nombre}
                </td>
                <td>${t.pts}</td>
            </tr>`;
        });
    } catch(err) {
        console.error("Error cargando tabla:", err);
        document.querySelector("#tablaGeneral tbody").innerHTML = "<tr><td colspan='3'>Error al cargar tabla</td></tr>";
    }
}

// Cargar al inicio
cargarNoticias();
cargarTabla();
setInterval(cargarTabla, 300000); // recarga cada 5 minutos
