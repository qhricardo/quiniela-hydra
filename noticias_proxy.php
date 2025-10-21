<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$apiKey = "pub_55007f214e86a5dc8a6dcb9ee8350d1d4c9";
$url = "https://newsdata.io/api/1/news?apikey={$apiKey}&q=futbol%20mexicano&country=mx&language=es";

$response = @file_get_contents($url);
if ($response === FALSE) {
  echo json_encode(["error" => "No se pudo obtener noticias"]);
} else {
  echo $response;
}
?>
