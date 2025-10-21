<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");

$rssUrl = "https://www.espn.com.mx/espn/rss/futbol/mexico";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $rssUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
$data = curl_exec($ch);
curl_close($ch);

if (!$data) {
    echo json_encode(["error" => "No se pudieron cargar las noticias"]);
    exit;
}

$xml = @simplexml_load_string($data);
if (!$xml) {
    echo json_encode(["error" => "No se pudieron cargar las noticias"]);
    exit;
}

$noticias = [];
foreach ($xml->channel->item as $i => $item) {
    if ($i >= 6) break;
    $noticias[] = [
        "titulo" => (string)$item->title,
        "link" => (string)$item->link,
        "descripcion" => strip_tags((string)$item->description),
    ];
}

echo json_encode(["noticias" => $noticias], JSON_UNESCAPED_UNICODE);
