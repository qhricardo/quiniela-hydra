async function cargarTabla() {
  try {
    const res = await fetch("backend/tabla.php");
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const tbody = document.querySelector("#tablaGeneral tbody");
    tbody.innerHTML = "";
    data.tabla.forEach(e => {
      tbody.innerHTML += `
        <tr>
          <td>${e.pos}</td>
          <td>${e.nombre}</td>
          <td>${e.puntos}</td>
        </tr>`;
    });
  } catch (err) {
    document.querySelector("#tablaGeneral tbody").innerHTML =
      "<tr><td colspan='3'>Error al cargar tabla</td></tr>";
  }
}
