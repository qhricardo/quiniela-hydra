<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");

$rssUrl = "https://www.espn.com.mx/espn/rss/futbol/mexico"; // RSS ESPN México

$xml = @simplexml_load_file($rssUrl);
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
        "descripcion" => (string)$item->description,
    ];
}

echo json_encode(["noticias" => $noticias], JSON_UNESCAPED_UNICODE);
