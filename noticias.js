// ─────────── Noticias ───────────
async function cargarNoticias(){
  try{
    const res = await fetch("api.php?accion=noticias");
    const noticias = await res.json();
    const cont = document.getElementById("noticias");
    cont.innerHTML = noticias.map(n => `
      <div style="margin-bottom:15px;">
        <h3>${n.title}</h3>
        ${n.img ? `<img src="${n.img}" style="width:100%; max-width:300px;">` : ""}
        <p><a href="${n.link}" target="_blank">Ver noticia completa</a></p>
      </div><hr>`).join("");
  } catch(err){
    console.error(err);
    document.getElementById("noticias").innerHTML = "<p>No se pudieron cargar noticias.</p>";
  }
}

// ─────────── Tabla Liga MX ───────────
async function cargarTabla(){
  try{
    const res = await fetch("api.php?accion=tabla");
    const data = await res.json();
    const tbody = document.querySelector("#tablaGeneral tbody");
    tbody.innerHTML = "";
    if(!data.data || !data.data.standings){
      tbody.innerHTML = "<tr><td colspan='3'>No hay datos disponibles</td></tr>";
      return;
    }
    data.data.standings.forEach((t,i)=>{
      const ptsObj = t.stats.find(s=>s.name.toLowerCase()==="points");
      const pts = ptsObj ? ptsObj.value : 0;
      const logo = t.team.logos?.[0]?.href || "";
      tbody.innerHTML += `
        <tr>
          <td>${i+1}</td>
          <td style="display:flex; align-items:center; gap:5px;">
            ${logo ? `<img src="${logo}" width="20">` : ""} ${t.team.name}
          </td>
          <td>${pts}</td>
        </tr>`;
    });
  } catch(err){
    console.error(err);
    document.querySelector("#tablaGeneral tbody").innerHTML = "<tr><td colspan='3'>Error al cargar tabla</td></tr>";
  }
}

// Llamadas iniciales
cargarNoticias();
cargarTabla();
setInterval(cargarTabla, 300000); // recarga cada 5 minutos
