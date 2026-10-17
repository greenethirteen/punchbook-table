import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { colors } from '@/lib/theme';

export type MapHandle = {
  /** Moves the map so the pin sits on this point, with a circle showing how sure the GPS is. */
  centerOn: (lat: number, lng: number, accuracy?: number | null, zoom?: number) => void;
  setSatellite: (on: boolean) => void;
};

type Props = {
  ref?: Ref<MapHandle>;
  initial: { lat: number; lng: number; zoom: number };
  /** The point under the centre pin after the map stops moving. `byUser` is true when the customer dragged it. */
  onSettle: (lat: number, lng: number, byUser: boolean) => void;
  onDragStart: () => void;
};

// Leaflet runs inside a WebView so the map needs no Google Maps API key.
// The pin is drawn by the screen on top of the map; the map reports what is under it.
const html = (lat: number, lng: number, zoom: number) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;height:100%;background:#e7e3d8}.leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="map"></div><script>
var post=function(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))};
var map=L.map('map',{zoomControl:false,attributionControl:true,maxZoom:20}).setView([${lat},${lng}],${zoom});
var street=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,maxNativeZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:20,maxNativeZoom:19,attribution:'Imagery © Esri'});
var ring=null,programmatic=false;
map.on('dragstart zoomstart',function(e){if(!programmatic)post({type:'drag'})});
map.on('moveend',function(){var c=map.getCenter();post({type:'settle',lat:c.lat,lng:c.lng,byUser:!programmatic});programmatic=false});
window.centerOn=function(lat,lng,acc,zoom){programmatic=true;
  if(ring){map.removeLayer(ring);ring=null}
  if(acc){ring=L.circle([lat,lng],{radius:acc,color:'#157d55',weight:1,fillColor:'#157d55',fillOpacity:0.12}).addTo(map)}
  map.setView([lat,lng],zoom||map.getZoom(),{animate:true});
  var c=map.getCenter();if(Math.abs(c.lat-lat)<1e-7&&Math.abs(c.lng-lng)<1e-7)setTimeout(function(){map.fire('moveend')},0)};
window.setSatellite=function(on){if(on){map.removeLayer(street);sat.addTo(map)}else{map.removeLayer(sat);street.addTo(map)}};
post({type:'ready'});
</script></body></html>`;

export function LocationMap({ ref, initial, onSettle, onDragStart }: Props) {
  const web = useRef<WebView>(null);
  // Leaflet loads from the network; calls made before it is ready wait here.
  const queue = useRef<string[]>([]);
  const ready = useRef(false);
  // OpenStreetMap's tile servers refuse requests without a referrer, so the page gets one.
  const [source] = useState(() => ({ html: html(initial.lat, initial.lng, initial.zoom), baseUrl: 'https://punchbook.online' }));

  const run = (js: string) => {
    if (ready.current) web.current?.injectJavaScript(js + ';true;');
    else queue.current.push(js);
  };

  useImperativeHandle(ref, () => ({
    centerOn: (lat, lng, accuracy, zoom) => run(`centerOn(${lat},${lng},${accuracy ?? 0},${zoom ?? 0})`),
    setSatellite: on => run(`setSatellite(${on})`),
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data);
    if (m.type === 'ready') {
      ready.current = true;
      queue.current.splice(0).forEach(run);
    } else if (m.type === 'drag') onDragStart();
    else if (m.type === 'settle') onSettle(m.lat, m.lng, m.byUser);
  };

  if (Platform.OS === 'web')
    return (
      <View style={[StyleSheet.absoluteFill, styles.webFallback]}>
        <Text style={{ color: colors.muted }}>The map opens in the Punchbook app.</Text>
      </View>
    );

  return (
    <WebView
      ref={web}
      source={source}
      originWhitelist={['*']}
      onMessage={onMessage}
      style={StyleSheet.absoluteFill}
      scrollEnabled={false}
      overScrollMode="never"
      setBuiltInZoomControls={false}
      javaScriptEnabled
    />
  );
}

const styles = StyleSheet.create({
  webFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.line },
});
