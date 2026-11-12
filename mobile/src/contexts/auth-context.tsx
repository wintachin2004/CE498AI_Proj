
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';

const API_URL = 'http://172.20.10.3:5000';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  created_at?: string;
};

type AuthContextType = {
  user: AuthUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');

      if (!token) {
        setUser(null);
        return;
      }

      // โหลดข้อมูลผู้ใช้ที่บันทึกไว้ก่อน
      const savedUser = await SecureStore.getItemAsync('auth_user');

      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          console.log('Saved user data is invalid');
        }
      }

      // ตรวจสอบ token กับ Backend
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // ล้าง token เฉพาะกรณีที่ยืนยันว่าไม่ได้รับอนุญาต
      if (response.status === 401 || response.status === 403) {
        await SecureStore.deleteItemAsync('auth_token');
        await SecureStore.deleteItemAsync('auth_user');
        setUser(null);
        return;
      }

      // กรณี Backend มีปัญหา ไม่ล้างข้อมูล Login เดิม
      if (!response.ok) {
        console.log('Cannot verify login:', response.status);
        return;
      }

      const data = await response.json();

      if (data.user) {
        setUser(data.user);

        await SecureStore.setItemAsync(
          'auth_user',
          JSON.stringify(data.user),
        );
      }
    } catch (error) {
      console.error('Refresh user error:', error);
      // หากเชื่อมต่อ Backend ไม่ได้ ให้คงข้อมูลผู้ใช้ที่บันทึกไว้
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('auth_user');
    setUser(null);
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        await refreshUser();
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
