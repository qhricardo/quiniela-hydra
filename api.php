<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// Parámetro ?accion=noticias o ?accion=tabla
$accion = $_GET['accion'] ?? '';

if ($accion === "noticias") {
    // RSS de Futbol Mexicano
    $rssUrl = "https://www.mediotiempo.com/rss/futbol-mexicano";

    $rssContent = file_get_contents($rssUrl);
    if (!$rssContent) {
        echo json_encode(["error" => "No se pudieron cargar noticias"]);
        exit;
    }

    $xml = simplexml_load_string($rssContent, "SimpleXMLElement", LIBXML_NOCDATA);
    $items = [];

    foreach ($xml->channel->item as $i => $item) {
        if ($i >= 5) break; // Solo 5 noticias
        $description = (string)$item->description;
        preg_match('/<img.*?src="(.*?)"/', $description, $matches);
        $img = $matches[1] ?? null;

        $items[] = [
            "title" => (string)$item->title,
            "link" => (string)$item->link,
            "image" => $img
        ];
    }

    echo json_encode($items);

} elseif ($accion === "tabla") {
    // Tabla Liga MX
    $apiUrl = "https://api-football-standings.azharimm.dev/leagues/mex.1/standings";
    $json = file_get_contents($apiUrl);
    if (!$json) {
        echo json_encode(["error" => "No se pudo cargar la tabla"]);
        exit;
    }

    $data = json_decode($json, true);
    $tabla = [];

    if(isset($data['data']['standings'])){
        foreach($data['data']['standings'] as $i => $t){
            $ptsObj = array_filter($t['stats'], fn($s)=> strtolower($s['name'])=="points");
            $ptsVal = $ptsObj ? array_values($ptsObj)[0]['value'] : 0;
            $logo = $t['team']['logos'][0]['href'] ?? '';
            $tabla[] = [
                "pos" => $i+1,
                "nombre" => $t['team']['name'],
                "pts" => $ptsVal,
                "logo" => $logo
            ];
        }
    }

    echo json_encode($tabla);

} else {
    echo json_encode(["error"=>"Acción no válida"]);
}
