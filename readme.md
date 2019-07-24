## Le principe nodal

Nodal part du principe que, dans un serveur ou un applicatif, je seul element indivible est la function.
En partant de ce principe, ou peut definir un serveur ou une application comme un groupe de fonction liés les unes aux autres, et une execution comme le parcours de du graph de ces fonctions.

Le code dans ce repository n'est qu'un possibilité de l'approche, l'on a ici un serveur HTTP, HTTPS, WebSocket, WebSockets rudimentaire a titre d'exemple.
Ce dernier s'articule de la manière suivante :

![alt text](https://raw.githubusercontent.com/pierredvd/nodal-server/master/apps/localhost/www/nodal.jpg)

Chaque functionalité atomique deviens un worker, qui accepte un payload d'entrée, le traite, et le passe au suivant.
Les worker communique par une plateforme commune, servant de hub, et collectant les informations de monitoring.

Si un node vient à planter, cette dernière sera rechargée, mais n'interropra pas les executions n'etant pas en train de l'utiliser.
Avec cette approche, on peut facilement envisager d'incorporation de nouvelle fonctionnalités par ajout de node, puis "recablage" du graph d'execution.
On peut egalement envisager plus facilement une scalarisation locale des points d'engorgement sans attributer de ressources la ou cela n'est pas necessaire, aussi bien d'un point de vue infrastructure, qu'applicatif.

Enfin, une node peut très facilement reservir dans un autre chainage, voire plusieurs chainages peut partager une meme node centralisée, comme par exemple, plusieurs serveurs HTTP, une seule node de session load balancée, plutot que de devoir synchroniser a posteriori 2 chainages distincts.

## Pour un test rapide

```bash
node bootstrap.js
```

Un objectif possible serai de pouvoir revisr le chainage au chaud via une interface graphique, faire le monitoring a la fois architecture et applicatif en un seul point, et permettre a la manière de docker, d'exporter un chainage sous forme de manifeste fichier pour permettre l'import export.
