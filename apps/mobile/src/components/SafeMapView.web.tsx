import React from 'react';
import { View, StyleSheet } from 'react-native';

export const PROVIDER_GOOGLE = 'google';

export const Marker = ({ coordinate, title, description, pinColor }: any) => {
    return null;
};

export const Polyline = ({ coordinates, strokeColor, strokeWidth }: any) => {
    return null;
};

interface SafeMapViewProps {
    children?: React.ReactNode;
    style?: any;
    region?: {
        latitude: number;
        longitude: number;
        latitudeDelta?: number;
        longitudeDelta?: number;
    };
    initialRegion?: {
        latitude: number;
        longitude: number;
        latitudeDelta?: number;
        longitudeDelta?: number;
    };
    [key: string]: any;
}

const SafeMapView = ({ children, style, region, initialRegion }: SafeMapViewProps) => {
    const lat = region?.latitude ?? initialRegion?.latitude ?? 12.9141;
    const lng = region?.longitude ?? initialRegion?.longitude ?? 74.8560;

    // Collect coordinates from children (Markers and Polylines)
    const markers: { lat: number; lng: number; title?: string; color?: string }[] = [];
    const polylines: { coords: { latitude: number; longitude: number }[]; color?: string }[] = [];

    React.Children.forEach(children, (child) => {
        if (!child || !React.isValidElement(child)) return;
        const p: any = child.props;
        if (p?.coordinate) {
            markers.push({
                lat: p.coordinate.latitude,
                lng: p.coordinate.longitude,
                title: p.title,
                color: p.pinColor || 'red',
            });
        } else if (p?.coordinates && Array.isArray(p.coordinates)) {
            polylines.push({
                coords: p.coordinates,
                color: p.strokeColor || '#2563EB',
            });
        }
    });

    // Stable iframe content based on coordinate keys (avoids reloading on identical state)
    const latRounded = Number(lat).toFixed(4);
    const lngRounded = Number(lng).toFixed(4);
    const iframeHtml = React.useMemo(() => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #e2e8f0; }
    .custom-pin {
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: bold; color: #fff;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    try {
      var map = L.map('map', { zoomControl: true, attributionControl: false }).setView([${lat}, ${lng}], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      // Add center / default marker if none passed
      var markersData = ${JSON.stringify(markers)};
      if (markersData.length === 0) {
        L.marker([${lat}, ${lng}]).addTo(map).bindPopup("<b>Incident Location</b><br>${lat.toFixed(5)}, ${lng.toFixed(5)}").openPopup();
      } else {
        var group = [];
        markersData.forEach(function(m) {
          var pinColor = m.color === 'green' ? '#10B981' : m.color === 'yellow' ? '#F59E0B' : '#DC2626';
          var customIcon = L.divIcon({
            className: '',
            html: '<div class="custom-pin" style="background-color:' + pinColor + ';">📍</div>',
            iconSize: [24, 24],
            iconAnchor: [12, 24]
          });
          var marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);
          if (m.title) marker.bindPopup("<b>" + m.title + "</b>");
          group.push([m.lat, m.lng]);
        });
      }

      // Draw polylines (SafeWalk / Cab routes)
      var polylinesData = ${JSON.stringify(polylines)};
      polylinesData.forEach(function(poly) {
        var latlngs = poly.coords.map(function(c) { return [c.latitude, c.longitude]; });
        L.polyline(latlngs, { color: poly.color || '#2563EB', weight: 5, opacity: 0.85 }).addTo(map);
      });
    } catch(e) {
      console.error("Leaflet load error", e);
    }
  </script>
</body>
</html>
    `, [latRounded, lngRounded, JSON.stringify(markers.map(m => m.color)), polylines.length]);

    return (
        <View style={[styles.container, style]}>
            <iframe
                title="Live Tactical Map"
                srcDoc={iframeHtml}
                style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 240,
                    border: 'none',
                    borderRadius: 12,
                    flex: 1,
                    display: 'block',
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        minHeight: 240,
        flex: 1,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        backgroundColor: '#F1F5F9',
    },
});

export default SafeMapView;
