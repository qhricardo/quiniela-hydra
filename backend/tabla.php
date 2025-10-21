<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");

$url = "https://api-football-standings.azharimm.dev/leagues/mex.1/standings";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$res = curl_exec($ch);
curl_close($ch);

if (!$res) {
    echo json_encode(["error" => "Error al cargar tabla"]);
    exit;
}

$data = json_decode($res, true);
$equipos = [];

if (isset($data["data"]["standings"])) {
    foreach ($data["data"]["standings"] as $i => $team) {
        $equipos[] = [
            "pos" => $i + 1,
            "nombre" => $team["team"]["name"],
            "puntos" => $team["stats"][6]["value"] ?? 0
        ];
    }
    echo json_encode(["tabla" => $equipos], JSON_UNESCAPED_UNICODE);
} else {
    echo json_encode(["error" => "Formato de datos no válido"]);
}
