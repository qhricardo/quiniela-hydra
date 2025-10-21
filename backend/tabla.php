<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");

$url = "https://api-football-standings.azharimm.dev/leagues/mex.1/standings";
$res = @file_get_contents($url);
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
}

echo json_encode(["tabla" => $equipos], JSON_UNESCAPED_UNICODE);
