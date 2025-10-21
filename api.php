<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

$accion = $_GET['accion'] ?? '';

if($accion === 'noticias'){
    $rssUrl = "https://www.mediotiempo.com/rss/futbol-mexicano";
    $rss = file_get_contents($rssUrl);
    if(!$rss) { echo json_encode([]); exit; }
    
    $xml = simplexml_load_string($rss, "SimpleXMLElement", LIBXML_NOCDATA);
    $json = [];
    $count = 0;
    foreach($xml->channel->item as $item){
        if($count++ >= 5) break;
        $desc = (string)$item->description;
        preg_match('/<img.*?src="(.*?)"/', $desc, $matches);
        $img = $matches[1] ?? '';
        $json[] = [
            'title' => (string)$item->title,
            'link' => (string)$item->link,
            'img' => $img
        ];
    }
    echo json_encode($json);
}

elseif($accion === 'tabla'){
    $url = "https://api-football-standings.azharimm.dev/leagues/mex.1/standings";
    $json = file_get_contents($url);
    echo $json;
}

else{
    echo json_encode(['error'=>'Accion no valida']);
}
?>
