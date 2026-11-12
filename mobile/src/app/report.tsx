import * as FileSystem from 'expo-file-system/legacy';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';

import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '@/contexts/auth-context';

const API_URL = 'http://172.20.10.3:5000';

const CATEGORIES = [
  'รถชนรถ',
  'รถชนคน',
  'รถจักรยานยนต์',
  'รถพลิกคว่ำ',
  'อื่น ๆ',
];

const SEVERITIES = [
  { label: 'เล็กน้อย', value: 'low', color: '#16a34a' },
  { label: 'ปานกลาง', value: 'medium', color: '#f59e0b' },
  { label: 'รุนแรง', value: 'high', color: '#dc2626' },
];

export default function ReportScreen() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);

  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const [description, setDescription] = useState('');

  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const [loadingGPS, setLoadingGPS] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ตรวจสอบสถานะ Login
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#dc2626" />
        <Text style={styles.loadingText}>กำลังตรวจสอบบัญชี...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>กรุณาเข้าสู่ระบบก่อน</Text>

        <TouchableOpacity
          style={styles.mainButton}
          onPress={() => router.replace('/login')}
        >
          <Text style={styles.mainButtonText}>เข้าสู่ระบบ</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>กลับหน้าหลัก</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ขอพิกัด GPS
  const getCurrentLocation = async () => {
    try {
      setLoadingGPS(true);
      setLocationConfirmed(false);

      const permission =
        await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'ไม่ได้รับอนุญาต',
          'กรุณาอนุญาตให้แอปเข้าถึงตำแหน่ง GPS'
        );
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);

      Alert.alert(
        'ได้รับตำแหน่งแล้ว',
        'กรุณาตรวจสอบพิกัดก่อนกดยืนยันตำแหน่ง'
      );
    } catch (error) {
      console.error('GPS error:', error);
      Alert.alert('ผิดพลาด', 'ไม่สามารถรับตำแหน่ง GPS ได้');
    } finally {
      setLoadingGPS(false);
    }
  };

  // เลือกรูปภาพจากโทรศัพท์
  const pickImage = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'ไม่ได้รับอนุญาต',
          'กรุณาอนุญาตให้แอปเข้าถึงรูปภาพ'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets.length > 0) {
        setImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('ผิดพลาด', 'ไม่สามารถเลือกรูปภาพได้');
    }
  };

  // ถ่ายภาพด้วยกล้อง
  const takePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'ไม่ได้รับอนุญาต',
          'กรุณาอนุญาตให้แอปใช้กล้อง'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets.length > 0) {
        setImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('ผิดพลาด', 'ไม่สามารถเปิดกล้องได้');
    }
  };

  // ส่งรายงานไป Backend
  
const submitReport = async () => {
  if (latitude === null || longitude === null) {
    Alert.alert('กรุณาระบุตำแหน่ง', 'กรุณากดรับตำแหน่ง GPS ก่อน');
    return;
  }

  if (!locationConfirmed) {
    Alert.alert('กรุณายืนยันตำแหน่ง', 'โปรดตรวจสอบและยืนยันพิกัดก่อนส่ง');
    return;
  }

  if (!category) {
    Alert.alert('ข้อมูลไม่ครบ', 'กรุณาเลือกประเภทอุบัติเหตุ');
    return;
  }

  if (!severity) {
    Alert.alert('ข้อมูลไม่ครบ', 'กรุณาเลือกระดับความรุนแรง');
    return;
  }

  if (!description.trim()) {
    Alert.alert('ข้อมูลไม่ครบ', 'กรุณากรอกรายละเอียดเหตุการณ์');
    return;
  }

  // บังคับแนบรูปภาพ
  if (!image) {
    Alert.alert('กรุณาแนบรูปภาพ', 'ระบบจำเป็นต้องใช้รูปภาพประกอบรายงาน');
    return;
  }

  try {
    setSubmitting(true);

    const token = await SecureStore.getItemAsync('auth_token');

    if (!token) {
      Alert.alert('กรุณาเข้าสู่ระบบใหม่', 'ไม่พบข้อมูลการเข้าสู่ระบบ');
      return;
    }

    const filename =
      image.fileName || `accident_${Date.now()}.jpg`;

    const extension = filename.split('.').pop()?.toLowerCase();

    const mimeType =
      image.mimeType ||
      (extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg');

    // อัปโหลดรูปและข้อมูลด้วย Expo FileSystem
    const result = await FileSystem.uploadAsync(
      `${API_URL}/api/accidents/report`,
      image.uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'image',
        mimeType,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        parameters: {
          latitude: String(latitude),
          longitude: String(longitude),
          category,
          severity,
          description: description.trim(),
          occurred_at: new Date().toISOString(),
        },
      }
    );

    let data: any = {};

    try {
      data = JSON.parse(result.body);
    } catch {
      console.log('Backend response:', result.body);
    }

    if (result.status === 401 || result.status === 403) {
      Alert.alert('Session หมดอายุ', 'กรุณาเข้าสู่ระบบใหม่');
      return;
    }

    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        data.message ||
        data.error ||
        result.body ||
        `ส่งรายงานไม่สำเร็จ (${result.status})`
      );
    }

    Alert.alert(
      'ส่งรายงานสำเร็จ',
      'ขอบคุณที่ช่วยแจ้งข้อมูลอุบัติเหตุ',
      [
        {
          text: 'ตกลง',
          onPress: () => router.back(),
        },
      ]
    );

  } catch (error) {
    console.error('Submit report error:', error);

    Alert.alert(
      'ส่งรายงานไม่สำเร็จ',
      error instanceof Error
        ? error.message
        : 'กรุณาตรวจสอบการเชื่อมต่อ Backend'
    );
  } finally {
    setSubmitting(false);
  }
};


  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>‹ กลับ</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            🚨 แจ้งอุบัติเหตุ
          </Text>

          <Text style={styles.headerSubtitle}>
            กรุณากรอกข้อมูลอุบัติเหตุที่พบ
          </Text>
        </View>

        {/* ผู้แจ้ง */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ผู้แจ้งเหตุ</Text>
          <Text style={styles.userText}>
            {user.name} ({user.email})
          </Text>
        </View>

        {/* GPS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            📍 ตำแหน่งที่เกิดอุบัติเหตุ
          </Text>

          <TouchableOpacity
            style={styles.gpsButton}
            onPress={getCurrentLocation}
            disabled={loadingGPS}
          >
            {loadingGPS ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.gpsButtonText}>
                รับตำแหน่ง GPS ปัจจุบัน
              </Text>
            )}
          </TouchableOpacity>

          {latitude !== null && longitude !== null && (
            <View style={styles.coordinateBox}>
              <Text style={styles.coordinateText}>
                Latitude: {latitude.toFixed(6)}
              </Text>

              <Text style={styles.coordinateText}>
                Longitude: {longitude.toFixed(6)}
              </Text>

              <Text style={styles.locationWarning}>
                โปรดตรวจสอบว่าพิกัดตรงกับจุดเกิดเหตุ
              </Text>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  locationConfirmed && styles.confirmedButton,
                ]}
                onPress={() => setLocationConfirmed(!locationConfirmed)}
              >
                <Text style={styles.confirmButtonText}>
                  {locationConfirmed
                    ? '✓ ยืนยันตำแหน่งแล้ว (กดเพื่อยกเลิก)'
                    : 'ยืนยันว่าตำแหน่งถูกต้อง'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ประเภทอุบัติเหตุ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            ประเภทอุบัติเหตุ *
          </Text>

          <View style={styles.optionContainer}>
            {CATEGORIES.map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.optionButton,
                  category === item && styles.selectedOption,
                ]}
                onPress={() => setCategory(item)}
              >
                <Text
                  style={[
                    styles.optionText,
                    category === item && styles.selectedOptionText,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ระดับความรุนแรง */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            ระดับความรุนแรง *
          </Text>

          <View style={styles.severityContainer}>
            {SEVERITIES.map((item) => (
              <TouchableOpacity
                key={item.value}
                style={[
                  styles.severityButton,
                  {
                    borderColor: item.color,
                    backgroundColor:
                      severity === item.value
                        ? item.color
                        : '#fff',
                  },
                ]}
                onPress={() => setSeverity(item.value)}
              >
                <Text
                  style={[
                    styles.severityText,
                    {
                      color:
                        severity === item.value
                          ? '#fff'
                          : item.color,
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* รายละเอียด */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            รายละเอียดเหตุการณ์ *
          </Text>

          <TextInput
            style={styles.textArea}
            placeholder="เช่น รถยนต์ชนกับรถจักรยานยนต์ มีผู้บาดเจ็บ..."
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* รูปภาพ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            📷 รูปภาพประกอบ
          </Text>

          <View style={styles.imageButtonContainer}>
            <TouchableOpacity
              style={styles.imageButton}
              onPress={takePhoto}
            >
              <Text style={styles.imageButtonText}>
                📸 ถ่ายภาพ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.imageButton}
              onPress={pickImage}
            >
              <Text style={styles.imageButtonText}>
                🖼 เลือกรูป
              </Text>
            </TouchableOpacity>
          </View>

          {image && (
            <View style={styles.previewContainer}>
              <Image
                source={{ uri: image.uri }}
                style={styles.previewImage}
              />

              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setImage(null)}
              >
                <Text style={styles.removeImageText}>
                  ลบรูปภาพ
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.hint}>
            กรุณาถ่ายภาพจากบริเวณที่ปลอดภัยเท่านั้น
          </Text>
        </View>

        {/* ส่งรายงาน */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            submitting && styles.disabledButton,
          ]}
          onPress={submitReport}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>
              🚨 ส่งรายงานอุบัติเหตุ
            </Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>
          * กรุณาตรวจสอบข้อมูลก่อนส่งรายงาน
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    color: '#555',
  },
  header: {
    backgroundColor: '#dc2626',
    paddingTop: 55,
    paddingBottom: 25,
    paddingHorizontal: 20,
  },
  backButton: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 15,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#ffe4e4',
    fontSize: 14,
    marginTop: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 14,
    marginTop: 14,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#222',
  },
  userText: {
    fontSize: 14,
    color: '#555',
  },
  gpsButton: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 9,
    alignItems: 'center',
  },
  gpsButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  coordinateBox: {
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 9,
    marginTop: 12,
  },
  coordinateText: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 5,
  },
  locationWarning: {
    color: '#b45309',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 12,
  },
  confirmButton: {
    backgroundColor: '#64748b',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmedButton: {
    backgroundColor: '#16a34a',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  optionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  selectedOption: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  optionText: {
    color: '#333',
    fontSize: 14,
  },
  selectedOptionText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  severityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 9,
    paddingVertical: 12,
    alignItems: 'center',
  },
  severityText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 9,
    padding: 12,
    minHeight: 120,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  imageButtonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  imageButton: {
    flex: 1,
    backgroundColor: '#475569',
    padding: 14,
    borderRadius: 9,
    alignItems: 'center',
  },
  imageButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  previewContainer: {
    marginTop: 14,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
  },
  removeImageButton: {
    marginTop: 10,
    padding: 8,
  },
  removeImageText: {
    color: '#dc2626',
    fontWeight: 'bold',
  },
  hint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 10,
  },
  submitButton: {
    backgroundColor: '#dc2626',
    marginHorizontal: 14,
    marginTop: 20,
    padding: 17,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  mainButton: {
    backgroundColor: '#dc2626',
    padding: 14,
    borderRadius: 9,
  },
  mainButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  backText: {
    marginTop: 20,
    color: '#2563eb',
  },
  footerText: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
    marginTop: 14,
  },
});
