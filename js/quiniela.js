<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pronósticos | Quiniela MX</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        h1 {
            color: #006847;
        }
        .user-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .quiniela-container {
            background: white;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .partido {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 0;
            border-bottom: 1px solid #eee;
        }
        .equipo {
            width: 30%;
            text-align: center;
            font-weight: bold;
        }
        .vs {
            width: 10%;
            text-align: center;
            font-weight: bold;
            color: #ce1126;
        }
        .prediccion {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .result-option {
            padding: 8px 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
        }
        .result-option.selected {
            background: #006847;
            color: white;
            border-color: #006847;
        }
        .local-win { background: #e8f5e9; }
        .visit-win { background: #ffebee; }
        .draw { background: #fff8e1; }
        button {
            background: #006847;
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 20px;
        }
        button:hover {
            background: #004d33;
        }
        #logout-btn {
            background: #ce1126;
        }
        #results-btn {
            background: #1976d2;
        }
    </style>
</head>
<body>
    <header>
        <h1>Quiniela MX - Jornada 1</h1>
        <div class="user-info">
            <span id="username"></span>
            <button id="logout-btn">Cerrar Sesión</button>
        </div>
    </header>

    <div class="quiniela-container">
        <!-- Partido 1 -->
        <div class="partido">
            <div class="equipo">América</div>
            <div class="vs">VS</div>
            <div class="equipo">Guadalajara</div>
            <div class="prediccion">
                <div class="result-option local-win" data-partido="1" data-result="1">1 (Local)</div>
                <div class="result-option draw" data-partido="1" data-result="X">X (Empate)</div>
                <div class="result-option visit-win" data-partido="1" data-result="2">2 (Visitante)</div>
            </div>
        </div>

        <!-- Partido 2 al 10 (misma estructura) -->
        <!-- ... (incluir los 9 partidos restantes con equipos mexicanos) ... -->

        <div style="display: flex; justify-content: space-between; margin-top: 30px;">
            <button id="guardar-btn">Guardar Pronósticos</button>
            <button id="results-btn">Ver Resultados</button>
        </div>
    </div>

    <!-- Firebase SDK -->
    <script src="https://www.gstatic.com/firebasejs/9.6.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.6.0/firebase-auth-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore-compat.js"></script>
    
    <!-- Configuración -->
    <script src="js/firebase-config.js"></script>
    
    <!-- Lógica -->
    <script>
        const db = firebase.firestore();
        let currentUser = null;

        // Cargar datos usuario
        firebase.auth().onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'login.html';
                return;
            }
            
            currentUser = user;
            document.getElementById('username').textContent = user.email;
            
            // Cargar pronósticos existentes
            const doc = await db.collection('pronosticos')
                .where('userId', '==', user.uid)
                .limit(1)
                .get();
                
            if (!doc.empty) {
                doc.forEach(d => {
                    const data = d.data();
                    data.partidos.forEach((partido, index) => {
                        const option = document.querySelector(`.result-option[data-partido="${index+1}"][data-result="${partido.prediccion}"]`);
                        if (option) option.classList.add('selected');
                    });
                });
            }
        });

        // Selección de resultados
        document.querySelectorAll('.result-option').forEach(option => {
            option.addEventListener('click', function() {
                // Remover selección previa en este partido
                const partido = this.getAttribute('data-partido');
                document.querySelectorAll(`.result-option[data-partido="${partido}"]`).forEach(el => {
                    el.classList.remove('selected');
                });
                
                // Seleccionar nueva opción
                this.classList.add('selected');
            });
        });

        // Guardar pronósticos
        document.getElementById('guardar-btn').addEventListener('click', async () => {
            const partidos = [];
            let complete = true;
            
            // Recolectar predicciones
            document.querySelectorAll('.partido').forEach((partidoEl, index) => {
                const selected = partidoEl.querySelector('.result-option.selected');
                if (!selected) {
                    complete = false;
                    return;
                }
                
                const equipos = partidoEl.querySelectorAll('.equipo');
                partidos.push({
                    local: equipos[0].textContent,
                    visitante: equipos[1].textContent,
                    prediccion: selected.getAttribute('data-result')
                });
            });
            
            if (!complete) {
                alert('¡Debes seleccionar un resultado para cada partido!');
                return;
            }
            
            try {
                await db.collection('pronosticos').add({
                    userId: currentUser.uid,
                    fecha: firebase.firestore.FieldValue.serverTimestamp(),
                    partidos: partidos
                });
                alert('¡Pronósticos guardados correctamente!');
            } catch (error) {
                console.error(error);
                alert('Error al guardar: ' + error.message);
            }
        });

        // Ver resultados
        document.getElementById('results-btn').addEventListener('click', () => {
            window.location.href = 'resultados.html';
        });

        // Cerrar sesión
        document.getElementById('logout-btn').addEventListener('click', () => {
            firebase.auth().signOut();
        });
    </script>
</body>
</html>
// Ejecutar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  firebase.auth().onAuthStateChanged((user) => {
    if (user) cargarPronosticos();
  });
});
