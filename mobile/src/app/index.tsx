
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";

type GPSPosition = {
  latitude: number;
  longitude: number;
};

type SearchResult = GPSPosition & {
  place_id: number;
  display_name: string;
};

type RouteInfo = {
  distance: number;
  duration: number;
};

type AccidentPoint = {
  lat: number;
  lon: number;
  province?: string | null;
  severity_score?: number | string | null;
};

const BANGKOK: GPSPosition = {
  latitude: 13.7563,
  longitude: 100.5018,
};

// สำหรับ Android Emulator ที่เรียก Backend บนคอมพิวเตอร์
const ACCIDENT_API_URL = "http://172.20.10.3:5000/api/map_points";

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet"
    href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    html, body, #map {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }

    .leaflet-container {
      background: #e8e8e8;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map').setView(
      [${BANGKOK.latitude}, ${BANGKOK.longitude}], 13
    );

    L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
      }
    ).addTo(map);

    let gpsMarker = null;
    let destinationMarker = null;
    let routeLayer = null;

    // แยกชั้นหมุดอุบัติเหตุออกจาก GPS และเส้นทาง
    const accidentLayer = L.layerGroup().addTo(map);

    function escapeHTML(value) {
      return String(value ?? "").replace(/[&<>"']/g, function(char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        }[char];
      });
    }

    window.setAccidentPoints = function(points) {
      accidentLayer.clearLayers();

      let count = 0;

      points.forEach(function(item) {
        const lat = Number(item.lat);
        const lon = Number(item.lon);

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          lat < -90 || lat > 90 ||
          lon < -180 || lon > 180
        ) {
          return;
        }

        const province = escapeHTML(
          item.province || "ไม่ระบุจังหวัด"
        );

        const severity = Number(item.severity_score);

        const severityText =
          item.severity_score !== null &&
          item.severity_score !== undefined &&
          item.severity_score !== "" &&
          Number.isFinite(severity)
            ? severity.toFixed(2)
            : "ไม่มีข้อมูล";

        const marker = L.circleMarker([lat, lon], {
          radius: 6,
          color: "#B91C1C",
          weight: 2,
          fillColor: "#EF4444",
          fillOpacity: 0.8
        });

        marker.bindPopup(
          "<b>จุดอุบัติเหตุในข้อมูลย้อนหลัง</b><br>" +
          "จังหวัด: " + province + "<br>" +
          "คะแนนความรุนแรง: " + escapeHTML(severityText)
        );

        marker.addTo(accidentLayer);
        count++;
      });

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type: "ACCIDENT_POINTS_RENDERED",
          count: count
        })
      );
    };

    window.setGPS = function(lat, lon) {
      const point = [lat, lon];

      if (gpsMarker) {
        gpsMarker.setLatLng(point);
      } else {
        gpsMarker = L.marker(point).addTo(map);
      }

      gpsMarker.bindPopup('ตำแหน่ง GPS ปัจจุบัน');
    };

    window.drawRoute = function(latlngs, destLat, destLon) {
      if (routeLayer) {
        map.removeLayer(routeLayer);
      }

      if (destinationMarker) {
        map.removeLayer(destinationMarker);
      }

      routeLayer = L.polyline(latlngs, {
        color: '#1565C0',
        weight: 6,
        opacity: 0.85
      }).addTo(map);

      destinationMarker = L.marker([destLat, destLon])
        .addTo(map)
        .bindPopup('ปลายทาง');

      map.fitBounds(routeLayer.getBounds(), {
        padding: [30, 30]
      });
    };

    window.clearRoute = function() {
      if (routeLayer) map.removeLayer(routeLayer);
      if (destinationMarker) map.removeLayer(destinationMarker);

      routeLayer = null;
      destinationMarker = null;
    };

    window.ReactNativeWebView.postMessage('MAP_READY');
  </script>
</body>
</html>
`;

export default function HomeScreen() {
  const webViewRef = useRef<WebView>(null);
  const lastSearchAt = useRef(0);
  const searchCache = useRef<Record<string, SearchResult[]>>({});
  const pendingAccidents = useRef<AccidentPoint[]>([]);
  const mapReadyRef = useRef(false);

  const [position, setPosition] = useState<GPSPosition | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadingGPS, setLoadingGPS] = useState(false);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);
  const [loadingAccidents, setLoadingAccidents] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [accidentMessage, setAccidentMessage] = useState("");
  const [accidentCount, setAccidentCount] = useState<number | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);

  const sendToMap = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script}; true;`);
  }, []);

  const sendGPS = useCallback((p: GPSPosition) => {
    sendToMap(
      `if (window.setGPS) window.setGPS(${p.latitude}, ${p.longitude})`
    );
  }, [sendToMap]);

  const sendAccidentsToMap = useCallback(() => {
    if (!mapReadyRef.current) return;

    const json = JSON.stringify(pendingAccidents.current);

    sendToMap(
      `if (window.setAccidentPoints) {
        window.setAccidentPoints(${json});
      }`
    );
  }, [sendToMap]);

  
  const loadAccidents = useCallback(async () => {
    if (!mapReadyRef.current) {
      setAccidentMessage("กำลังรอแผนที่พร้อมใช้งาน");
      console.log("[Accidents] Map is not ready yet");
      return;
    }

    setLoadingAccidents(true);
    setAccidentMessage("กำลังโหลดจุดอุบัติเหตุ...");

    console.log("[Accidents] Request URL:", ACCIDENT_API_URL);
    console.log("[Accidents] Starting request...");

    try {
      const response = await fetch(ACCIDENT_API_URL);

      console.log("[Accidents] HTTP status:", response.status);
      console.log("[Accidents] Response OK:", response.ok);

      if (!response.ok) {
        throw new Error(`Backend ตอบกลับ HTTP ${response.status}`);
      }

      const data: unknown = await response.json();

      console.log(
        "[Accidents] Received records:",
        Array.isArray(data) ? data.length : "Response is not an array"
      );

      if (!Array.isArray(data)) {
        throw new Error("รูปแบบข้อมูลจุดอุบัติเหตุไม่ถูกต้อง");
      }

      const validPoints: AccidentPoint[] = data.filter((item: any) => {
        if (
          item?.lat === null ||
          item?.lat === undefined ||
          item?.lat === "" ||
          item?.lon === null ||
          item?.lon === undefined ||
          item?.lon === ""
        ) {
          return false;
        }

        const lat = Number(item.lat);
        const lon = Number(item.lon);

        return (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          lat >= -90 &&
          lat <= 90 &&
          lon >= -180 &&
          lon <= 180
        );
      });

      console.log("[Accidents] Valid points:", validPoints.length);

      pendingAccidents.current = validPoints;
      sendAccidentsToMap();

      setAccidentMessage(
        `โหลดข้อมูลสำเร็จ ${validPoints.length.toLocaleString()} จุด (ข้อมูลย้อนหลัง)`
      );
    } catch (error) {
      console.error("[Accidents] Request failed:", error);

      const detail =
        error instanceof Error ? error.message : String(error);

      console.error("[Accidents] Error detail:", detail);

      setAccidentMessage(
        "โหลดจุดอุบัติเหตุไม่สำเร็จ ตรวจสอบ Backend และการเชื่อมต่อ"
      );
    } finally {
      setLoadingAccidents(false);
      console.log("[Accidents] Request finished");
    }
  }, [sendAccidentsToMap]);


  async function getGPS() {
    try {
      setLoadingGPS(true);

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setMessage("ไม่ได้รับอนุญาต GPS กรุณาเปิดสิทธิ์ตำแหน่ง");
        return;
      }

      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const p: GPSPosition = {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      };

      setPosition(p);

      if (mapReadyRef.current) {
        sendGPS(p);
      }
    } catch (error) {
      console.error("GPS error:", error);
      setMessage("อ่าน GPS ไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าตำแหน่ง");
    } finally {
      setLoadingGPS(false);
    }
  }

  useEffect(() => {
    if (mapLoaded && position) {
      sendGPS(position);
    }
  }, [mapLoaded, position, sendGPS]);

  useEffect(() => {
    if (mapLoaded) {
      sendAccidentsToMap();
    }
  }, [mapLoaded, sendAccidentsToMap]);

  useEffect(() => {
    getGPS();
  }, []);

  function handleWebViewMessage(event: WebViewMessageEvent) {
    const data = event.nativeEvent.data;

    if (data === "MAP_READY") {
      mapReadyRef.current = true;
      setMapLoaded(true);
      sendAccidentsToMap();

      if (position) {
        sendGPS(position);
      }

      return;
    }

    try {
      const parsed = JSON.parse(data);

      if (parsed.type === "ACCIDENT_POINTS_RENDERED") {
        setAccidentCount(parsed.count);
      }
    } catch {
      // ข้ามข้อความที่ไม่ใช่ JSON
    }
  }

  async function searchPlaces() {
    const text = query.trim();

    if (text.length < 2) {
      setMessage("กรุณาพิมพ์ชื่อสถานที่อย่างน้อย 2 ตัวอักษร");
      setResults([]);
      return;
    }

    Keyboard.dismiss();
    setSearching(true);
    setMessage("กำลังค้นหาสถานที่...");
    setResults([]);
    setSelected(null);
    setRouteInfo(null);

    sendToMap("if (window.clearRoute) window.clearRoute()");

    const cacheKey = text.toLowerCase();

    try {
      let places = searchCache.current[cacheKey];

      if (!places) {
        const wait = Math.max(
          0,
          1100 - (Date.now() - lastSearchAt.current)
        );

        if (wait > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, wait)
          );
        }

        const url =
          "https://nominatim.openstreetmap.org/search?" +
          new URLSearchParams({
            q: text,
            format: "jsonv2",
            limit: "5",
            addressdetails: "1",
            "accept-language": "th",
          }).toString();

        lastSearchAt.current = Date.now();

        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(
            `เซิร์ฟเวอร์ค้นหาตอบกลับ HTTP ${response.status}`
          );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("ข้อมูลผลการค้นหาไม่ถูกต้อง");
        }

        places = data.map((item: any) => ({
          place_id: Number(item.place_id),
          display_name: String(item.display_name),
          latitude: Number(item.lat),
          longitude: Number(item.lon),
        }));

        searchCache.current[cacheKey] = places;
      }

      setResults(places);

      if (places.length === 0) {
        setMessage(
          "ไม่พบสถานที่ ลองพิมพ์ชื่อสถานที่เป็นภาษาอังกฤษหรือเพิ่มชื่อจังหวัด"
        );
      } else {
        setMessage(`พบ ${places.length} สถานที่ กรุณาเลือกปลายทาง`);
      }
    } catch (error) {
      console.error("Place search error:", error);

      const detail =
        error instanceof Error ? error.message : String(error);

      setMessage(
        `ค้นหาไม่สำเร็จ: ${detail} กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่`
      );
    } finally {
      setSearching(false);
    }
  }

  async function buildRoute(destination: SearchResult) {
    if (!position) {
      setMessage("ยังไม่มีตำแหน่งต้นทาง กรุณาอัปเดต GPS ก่อน");
      return;
    }

    setRouting(true);
    setMessage("");
    setRouteInfo(null);
    setSelected(destination);

    try {
      const start = `${position.longitude},${position.latitude}`;
      const end = `${destination.longitude},${destination.latitude}`;

      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${start};${end}?overview=simplified&geometries=geojson`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `เซิร์ฟเวอร์เส้นทางตอบกลับ HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (data.code !== "Ok" || !data.routes?.length) {
        throw new Error("ไม่พบเส้นทางรถยนต์ไปยังสถานที่นี้");
      }

      const route = data.routes[0];
      const coordinates = route.geometry.coordinates as number[][];

      const latlngs = coordinates.map(
        ([lon, lat]) => [lat, lon]
      );

      sendToMap(
        `if (window.drawRoute) window.drawRoute(` +
        `${JSON.stringify(latlngs)},` +
        `${destination.latitude},${destination.longitude})`
      );

      setRouteInfo({
        distance: route.distance,
        duration: route.duration,
      });

      setMessage("คำนวณเส้นทางสำเร็จ");
      setResults([]);
    } catch (error) {
      console.error("Route error:", error);

      setMessage(
        "คำนวณเส้นทางไม่สำเร็จ: " +
          (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setRouting(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setRouteInfo(null);
    setMessage("");
    sendToMap("if (window.clearRoute) window.clearRoute()");
  }

  function formatDistance(meters: number) {
    return meters >= 1000
      ? `${(meters / 1000).toFixed(1)} กม.`
      : `${Math.round(meters)} เมตร`;
  }

  function formatDuration(seconds: number) {
    const minutes = Math.round(seconds / 60);

    if (minutes < 60) {
      return `${minutes} นาที`;
    }

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    return remaining
      ? `${hours} ชม. ${remaining} นาที`
      : `${hours} ชม.`;
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Do Accident</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="ค้นหาสถานที่หรือที่อยู่..."
          placeholderTextColor="#777"
          returnKeyType="search"
          onSubmitEditing={searchPlaces}
          editable={!searching}
        />

        <Pressable
          style={[
            styles.searchButton,
            searching && styles.disabledButton,
          ]}
          onPress={searchPlaces}
          disabled={searching}
        >
          {searching ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>ค้นหา</Text>
          )}
        </Pressable>
      </View>

      {!!message && (
        <Text style={styles.message}>{message}</Text>
      )}

      {results.length > 0 && (
        <View style={styles.resultsBox}>
          <Text style={styles.sectionTitle}>เลือกปลายทาง</Text>

          <ScrollView
            style={styles.resultsList}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {results.map((item) => (
              <Pressable
                key={item.place_id}
                style={styles.resultItem}
                onPress={() => buildRoute(item)}
                disabled={routing}
              >
                <Text style={styles.resultName}>
                  {item.display_name}
                </Text>
                <Text style={styles.resultAction}>
                  แตะเพื่อแสดงเส้นทางรถยนต์
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {routing && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#1565C0" />
          <Text>กำลังคำนวณเส้นทาง...</Text>
        </View>
      )}

      {routeInfo && selected && (
        <View style={styles.routeCard}>
          <Text style={styles.sectionTitle}>เส้นทางไปยัง</Text>
          <Text>{selected.display_name}</Text>

          <View style={styles.routeStats}>
            <View>
              <Text style={styles.statValue}>
                {formatDistance(routeInfo.distance)}
              </Text>
              <Text style={styles.statLabel}>ระยะทาง</Text>
            </View>

            <View>
              <Text style={styles.statValue}>
                {formatDuration(routeInfo.duration)}
              </Text>
              <Text style={styles.statLabel}>เวลาโดยประมาณ</Text>
            </View>
          </View>

          <Text style={styles.disclaimer}>
            เวลาเป็นค่าประมาณ ไม่ใช่ข้อมูลจราจรแบบเรียลไทม์
          </Text>

          <Pressable
            style={styles.clearButton}
            onPress={clearSearch}
          >
            <Text style={styles.buttonText}>ล้างเส้นทาง</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          source={{
            html: MAP_HTML,
            baseUrl: "https://localhost",
          }}
          style={styles.map}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          onMessage={handleWebViewMessage}
          onError={(event) => {
            setMessage(
              "เปิดแผนที่ไม่สำเร็จ: " +
                event.nativeEvent.description
            );
          }}
        />

        {!mapLoaded && (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color="#1565C0" />
            <Text>กำลังโหลดแผนที่...</Text>
          </View>
        )}
      </View>

      <View style={styles.accidentPanel}>
        <View style={styles.accidentInfo}>
          <Text style={styles.accidentTitle}>
            🔴 จุดอุบัติเหตุย้อนหลัง
          </Text>

          <Text style={styles.accidentStatus}>
            {accidentMessage ||
              (accidentCount !== null
                ? `แสดง ${accidentCount.toLocaleString()} จุดบนแผนที่`
                : "ยังไม่ได้โหลดข้อมูล")}
          </Text>
        </View>

        <Pressable
          style={[
            styles.reloadButton,
            loadingAccidents && styles.disabledButton,
          ]}
          onPress={loadAccidents}
          disabled={!mapLoaded || loadingAccidents}
        >
          {loadingAccidents ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>โหลดใหม่</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.attribution}>
        © OpenStreetMap contributors · เส้นทางโดย OSRM
      </Text>

      {position && (
        <Text style={styles.coordinates}>
          GPS: {position.latitude.toFixed(5)},{" "}
          {position.longitude.toFixed(5)}
        </Text>
      )}

      <Pressable
        style={styles.gpsButton}
        onPress={getGPS}
        disabled={loadingGPS}
      >
        {loadingGPS ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            อัปเดตตำแหน่ง GPS
          </Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
  },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#222",
  },
  searchButton: {
    backgroundColor: "#1565C0",
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    minWidth: 76,
  },
  disabledButton: {
    opacity: 0.65,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    textAlign: "center",
  },
  message: {
    color: "#B91C1C",
    marginHorizontal: 12,
    marginBottom: 6,
    fontSize: 13,
  },
  resultsBox: {
    maxHeight: 180,
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#fff",
  },
  sectionTitle: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  resultsList: {
    flexGrow: 0,
  },
  resultItem: {
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  resultName: {
    color: "#222",
    fontSize: 13,
  },
  resultAction: {
    color: "#1565C0",
    fontSize: 12,
    marginTop: 3,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 6,
  },
  routeCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: "#F2F7FF",
    borderRadius: 10,
    gap: 5,
  },
  routeStats: {
    flexDirection: "row",
    gap: 30,
    marginTop: 5,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1565C0",
  },
  statLabel: {
    color: "#555",
    fontSize: 12,
  },
  disclaimer: {
    fontSize: 11,
    color: "#666",
  },
  clearButton: {
    alignSelf: "flex-start",
    backgroundColor: "#64748b",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginTop: 4,
  },
  mapContainer: {
    flex: 1,
    minHeight: 180,
    marginTop: 4,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  mapLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f2f2f2",
  },
  accidentPanel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
  },
  accidentInfo: {
    flex: 1,
  },
  accidentTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#991B1B",
  },
  accidentStatus: {
    fontSize: 11,
    color: "#555",
    marginTop: 3,
  },
  reloadButton: {
    backgroundColor: "#B91C1C",
    minWidth: 84,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  attribution: {
    fontSize: 10,
    textAlign: "right",
    color: "#555",
    paddingHorizontal: 8,
  },
  coordinates: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
    paddingTop: 4,
  },
  gpsButton: {
    backgroundColor: "#1565C0",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 12,
    marginVertical: 8,
  },
});
