<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

$url = "https://api-football-standings.azharimm.dev/leagues/mex.1/standings";
$response = file_get_contents($url);
echo $response;
?>
