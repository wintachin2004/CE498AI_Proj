
import { Tabs, useRouter } from 'expo-router';
import {
  useColorScheme,
  Text,
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  Alert,
} from 'react-native';
import { useState } from 'react';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();

  const [menuVisible, setMenuVisible] = useState(false);
  const { user, loading, logout } = useAuth();

  const goTo = (
    path: '/login' | '/register' | '/profile' | '/report'
  ) => {
    setMenuVisible(false);
    router.push(path);
  };

  const handleLogout = () => {
    setMenuVisible(false);

    Alert.alert(
      'ออกจากระบบ',
      'คุณต้องการออกจากระบบใช่หรือไม่?',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ออกจากระบบ',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(tabs)');
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerTitle: 'Do Accident',
          headerTitleAlign: 'center',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              style={{ paddingHorizontal: 18 }}
            >
              <Text style={{ fontSize: 27, color: colors.text }}>
                ☰
              </Text>
            </TouchableOpacity>
          ),
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.icon,
          tabBarStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Text style={{ color, fontSize: size }}>⌂</Text>
            ),
          }}
        />

        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color, size }) => (
              <Text style={{ color, fontSize: size }}>◎</Text>
            ),
          }}
        />
      </Tabs>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setMenuVisible(false)}
          />

          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Do Accident</Text>

              <Text style={styles.drawerSubtitle}>
                ระบบแผนที่ความเสี่ยงอุบัติเหตุ
              </Text>

              {loading ? (
                <Text style={styles.userStatus}>
                  กำลังตรวจสอบบัญชี...
                </Text>
              ) : user ? (
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>
                    {user.name}
                  </Text>
                  <Text style={styles.userEmail}>
                    {user.email}
                  </Text>
                </View>
              ) : (
                <Text style={styles.userStatus}>
                  ยังไม่ได้เข้าสู่ระบบ
                </Text>
              )}
            </View>

            {/* หน้าหลัก */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.navigate('/(tabs)');
              }}
            >
              <Text style={styles.menuText}>
                ⌂  หน้าหลัก / แผนที่
              </Text>
            </TouchableOpacity>

            {!loading && (
              <>
                {user ? (
                  <>
                    {/* โปรไฟล์ */}
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => goTo('/profile')}
                    >
                      <Text style={styles.menuText}>
                        👤  โปรไฟล์ของฉัน
                      </Text>
                    </TouchableOpacity>

                    {/* แจ้งอุบัติเหตุ */}
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => goTo('/report')}
                    >
                      <Text style={styles.menuText}>
                        🚨  แจ้งอุบัติเหตุ
                      </Text>
                    </TouchableOpacity>

                    {/* ออกจากระบบ */}
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={handleLogout}
                    >
                      <Text
                        style={[
                          styles.menuText,
                          styles.logoutMenuText,
                        ]}
                      >
                        ↪  ออกจากระบบ (Logout)
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* เข้าสู่ระบบ */}
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => goTo('/login')}
                    >
                      <Text style={styles.menuText}>
                        🔑  เข้าสู่ระบบ (Login)
                      </Text>
                    </TouchableOpacity>

                    {/* สมัครสมาชิก */}
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={() => goTo('/register')}
                    >
                      <Text style={styles.menuText}>
                        👤  สมัครสมาชิก (Register)
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setMenuVisible(false)}
            >
              <Text style={styles.closeText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    width: '78%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: '#FFFFFF',
    paddingTop: 55,
    paddingHorizontal: 20,
    elevation: 10,
  },
  drawerHeader: {
    backgroundColor: '#649fda',
    padding: 22,
    borderRadius: 14,
    marginBottom: 20,
  },
  drawerTitle: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#000000',
  },
  drawerSubtitle: {
    color: '#000000',
    fontSize: 13,
    marginTop: 8,
  },
  userStatus: {
    color: '#173B65',
    fontSize: 13,
    marginTop: 15,
  },
  userInfo: {
    marginTop: 15,
  },
  userName: {
    color: '#173B65',
    fontSize: 17,
    fontWeight: 'bold',
  },
  userEmail: {
    color: '#173B65',
    fontSize: 12,
    marginTop: 4,
  },
  menuItem: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  menuText: {
    fontSize: 16,
    color: '#173B65',
    fontWeight: '600',
  },
  logoutMenuText: {
    color: '#DC2626',
  },
  closeButton: {
    marginTop: 25,
    padding: 14,
    backgroundColor: '#E8F1F8',
    borderRadius: 10,
    alignItems: 'center',
  },
  closeText: {
    color: '#173B65',
    fontWeight: 'bold',
  },
});
