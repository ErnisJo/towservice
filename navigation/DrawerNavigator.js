import React, { useEffect, useState, useRef } from 'react';
import { TouchableOpacity, View, Text, Easing, Animated, InteractionManager, ActivityIndicator, StyleSheet } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { createStackNavigator, CardStyleInterpolators, TransitionSpecs } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../components/HomeScreen';
import HistoryScreen from '../components/HistoryScreen';
import OrderDetailsScreen from '../components/OrderDetailsScreen';
import BridgeToHome from '../components/BridgeToHome';
import SettingsScreen from '../components/SettingsScreen';
import InfoScreen from '../components/InfoScreen';
import SupportScreen from '../components/SupportScreen';
import LoginScreen from '../components/LoginScreen';
import RegisterScreen from '../components/RegisterScreen';
import ProfileScreen from '../components/ProfileScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { on as onEvent, off as offEvent } from '../utils/eventBus';
// import { backgroundColor } from '../app.config';
const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

// HOC для анимации экранов (как на сайтах - все смонтированы, анимируется opacity + transform)
function withScreenAnimation(StackComponent) {
  return function AnimatedStack(props) {
    const opacity = useRef(new Animated.Value(0)).current; // Начинаем с 0 - невидим
    const translateY = useRef(new Animated.Value(20)).current; // Начинаем снизу
    const [isFocused, setIsFocused] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);

    useFocusEffect(
      React.useCallback(() => {
        // Экран получил фокус - показываем загрузку
        setIsFocused(true);
        setIsLoading(true);
        
        // Мгновенно скрываем экран (чтобы не было видно предыдущий)
        opacity.setValue(0);
        translateY.setValue(20);
        
        // Ждём завершения рендеринга и всех взаимодействий
        const task = InteractionManager.runAfterInteractions(() => {
          // Рендеринг завершён - убираем загрузку и запускаем анимацию
          setIsLoading(false);
          
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 600,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: 0,
              duration: 600,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start();
        });

        return () => {
          // Отменяем задачу если она ещё не выполнена
          task.cancel();
          
          // Экран потерял фокус - мгновенно скрываем
          setIsFocused(false);
          setIsLoading(false);
          opacity.setValue(0);
          translateY.setValue(20);
        };
      }, [opacity, translateY])
    );

    return (
      <>
        {/* Белый фон пока экран рендерится */}
        {isLoading && (
          <View style={styles.loadingOverlay} />
        )}
        
        {/* Сам экран с анимацией */}
        <Animated.View
          style={{
            flex: 1,
            opacity: isFocused ? opacity : 0, // Если не в фокусе - полностью прозрачен
            transform: [{ translateY }],
          }}
          pointerEvents={isFocused ? 'auto' : 'none'}
        >
          <StackComponent {...props} />
        </Animated.View>
      </>
    );
  };
}

// Компонент-обёртка с анимацией для drawer экранов (как на сайтах - все смонтированы, видим только активный)
function AnimatedScreenWrapper({ children, isActive }) {
  const opacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(isActive ? 0 : 30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: isActive ? 1 : 0,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: isActive ? 0 : 30,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, opacity, translateY]);

  return (
    <Animated.View 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity,
        transform: [{ translateY }],
      }}
      pointerEvents={isActive ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}

// Плавная анимация fade для переходов внутри стеков
const FadeTransition = {
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  cardStyleInterpolator: ({ current, next }) => {
    return {
      cardStyle: {
        opacity: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
        }),
      },
      overlayStyle: {
        opacity: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.5],
        }),
      },
    };
  },
  transitionSpec: {
    open: {
      animation: 'timing',
      config: {
        duration: 300,
        easing: Easing.ease,
      },
    },
    close: {
      animation: 'timing',
      config: {
        duration: 250,
        easing: Easing.ease,
      },
    },
  },
};

// Drawer icon styling

// Shared header buttons with larger tap area and a short press lock to avoid double triggers
let backPressLocked = false;
function BackButton({ navigation }) {
  const onPress = () => {
    if (backPressLocked) return;
    backPressLocked = true;
    try {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.push('BridgeToHome');
    } finally {
      setTimeout(() => { backPressLocked = false; }, 500);
    }
  };
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }} style={{ marginLeft: 12 }}>
      <Ionicons name="arrow-back" size={24} color="#111" />
    </TouchableOpacity>
  );
}

function MenuButton({ navigation }) {
  return (
    <TouchableOpacity onPress={() => navigation.getParent()?.openDrawer()} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }} style={{ marginLeft: 12 }}>
      <Ionicons name="menu" size={24} color="#111" />
    </TouchableOpacity>
  );
}

function MapStackBase(props) {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ ...FadeTransition }}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          headerShown: false,
        })}
      />
  {/* Удалили страницу заявки. Заявка создаётся на карте. */}
    </Stack.Navigator>
  );
}

const MapStack = withScreenAnimation(MapStackBase);

function HistoryStackBase(props) {
  return (
    <Stack.Navigator
      initialRouteName="History"
      screenOptions={({ navigation }) => ({
        ...FadeTransition,
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          ...FadeTransition,
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'История заказов' }} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ title: 'Детали заказа' }} />
    </Stack.Navigator>
  );
}

const HistoryStack = withScreenAnimation(HistoryStackBase);

function SettingsStackBase(props) {
  return (
    <Stack.Navigator
      initialRouteName="Settings"
      screenOptions={({ navigation }) => ({
        ...FadeTransition,
    headerLeft: () => (
          <Ionicons
            name="arrow-back"
            size={24}
            color="#111"
            style={{ marginLeft: 12 }}
            onPress={() => {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.push('BridgeToHome');
            }}
          />
        ),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          ...FadeTransition,
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
  <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
  <Stack.Screen
    name="Profile"
    component={ProfileScreen}
    options={({ navigation }) => ({
      title: 'Профиль',
      // Override back: go to previous drawer route (parent) instead of popping to Settings
      headerLeft: () => (
        <Ionicons
          name="arrow-back"
          size={24}
          color="#111"
          style={{ marginLeft: 12 }}
          onPress={() => {
            try {
              const parent = navigation.getParent && navigation.getParent();
              if (parent && typeof parent.goBack === 'function') { parent.goBack(); return; }
            } catch {}
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.push('BridgeToHome');
          }}
        />
      ),
    })}
  />
    </Stack.Navigator>
  );
}

const SettingsStack = withScreenAnimation(SettingsStackBase);

function InfoStackBase(props) {
  return (
    <Stack.Navigator
      initialRouteName="Info"
      screenOptions={({ navigation }) => ({
        ...FadeTransition,
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          ...FadeTransition,
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Info" component={InfoScreen} options={{ title: 'Информация' }} />
    </Stack.Navigator>
  );
}

const InfoStack = withScreenAnimation(InfoStackBase);

function SupportStackBase(props) {
  return (
    <Stack.Navigator
      initialRouteName="Support"
      screenOptions={({ navigation }) => ({
        ...FadeTransition,
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          ...FadeTransition,
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Support" component={SupportScreen} options={{ title: 'Служба поддержки' }} />
    </Stack.Navigator>
  );
}

const SupportStack = withScreenAnimation(SupportStackBase);

function LoginStackBase(props) {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={({ navigation }) => ({
        ...FadeTransition,
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          ...FadeTransition,
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Вход' }} />
    </Stack.Navigator>
  );
}

const LoginStack = withScreenAnimation(LoginStackBase);

function RegisterStackBase(props) {
  return (
    <Stack.Navigator
      initialRouteName="Register"
      screenOptions={({ navigation }) => ({
        ...FadeTransition,
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          ...FadeTransition,
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Регистрация' }} />
    </Stack.Navigator>
  );
}

const RegisterStack = withScreenAnimation(RegisterStackBase);

// Dedicated stack to open Profile directly (avoids passing through Settings)
function ProfileStackBase(props) {
  return (
    <Stack.Navigator
      initialRouteName="Profile"
      screenOptions={({ navigation }) => ({
        ...FadeTransition,
        headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          ...FadeTransition,
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Профиль' }} />
    </Stack.Navigator>
  );
}

const ProfileStack = withScreenAnimation(ProfileStackBase);

export default function DrawerNavigator() {
  function ProfileHeader({ navigation, stateIndex }) {
    const [user, setUser] = useState(null);
    useEffect(() => {
      let mounted = true;
  const refresh = async () => {
        try {
          const raw = await AsyncStorage.getItem('tow_user');
          if (mounted) setUser(raw ? JSON.parse(raw) : null);
        } catch {}
      };
      refresh();

      let unsubFocus = null;
      let unsubDrawer = null;
      let unsubState = null;
      try {
        if (navigation && typeof navigation.addListener === 'function') {
          // Refresh when any screen inside the drawer gains focus
          unsubFocus = navigation.addListener('focus', refresh);
          // Refresh when the drawer is opened
          unsubDrawer = navigation.addListener('drawerOpen', refresh);
          // Fallback: refresh on any state change of the drawer navigator
          unsubState = navigation.addListener('state', refresh);
        }
        // Also respond to global auth changes
        const off = onEvent('auth:changed', refresh);
        // store to cleanup
        unsubState = (function(prev, offFn){ return { remove(){ try{ if (typeof prev==='function') prev(); else if (prev && typeof prev.remove==='function') prev.remove(); } catch{}; try{ offFn && offFn(); } catch{} } } })(unsubState, off);
      } catch {}
      return () => {
        mounted = false;
        try {
          if (typeof unsubFocus === 'function') unsubFocus();
          else if (unsubFocus && typeof unsubFocus.remove === 'function') unsubFocus.remove();
          if (typeof unsubDrawer === 'function') unsubDrawer();
          else if (unsubDrawer && typeof unsubDrawer.remove === 'function') unsubDrawer.remove();
          if (typeof unsubState === 'function') unsubState();
          else if (unsubState && typeof unsubState.remove === 'function') unsubState.remove();
        } catch {}
      };
    }, [navigation, stateIndex]);
    return (
      <TouchableOpacity
  onPress={() => navigation.navigate('Профиль')}
        activeOpacity={0.9}
        style={{ marginHorizontal: 12, paddingHorizontal: 5, paddingTop: 16, paddingBottom: 12, backgroundColor: '#ffffffff' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#ffffffff', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={22} color="#e6e6e6ff" />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '400', color: '#111' }}>{user?.name || 'Профиль'}</Text>
            <Text style={{ fontSize: 12, color: '#666' }}>{user?.phone || 'Не вошли'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function CustomDrawerContent(props) {
    const { state, navigation, descriptors } = props;
    const getItemStyles = (focused) => ({
      item: {
  // Remove internal padding to let the focused background render correctly edge-to-edge
  borderRadius: 22,
  marginHorizontal: 12,
  backgroundColor: focused ? '#f1f1f1ff' : 'transparent',
      },
      label: {
  // Keep default left alignment; avoid negative offsets that push text outside the background
        fontSize: 15,
        fontWeight: '400',
  color: '#111',
      },
    });
    const getIconName = (name) => {
      switch (name) {
        case 'Карта':
          return 'map-outline';
        case 'История заказов':
          return 'time-outline';
        case 'Настройки':
          return 'settings-outline';
        case 'Информация':
          return 'information-circle-outline';
        case 'Служба поддержки':
          return 'help-circle-outline';
        default:
          return 'ellipse-outline';
      }
    };
    return (
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingVertical: 8 }}>
        <ProfileHeader navigation={props.navigation} stateIndex={state.index} />
        <View style={{ height: 20 }} />
        {state.routes.map((route, i) => {
          const focused = i === state.index;
          const styles = getItemStyles(focused);
          const options = descriptors[route.key]?.options || {};
          const label =
            typeof options.drawerLabel === 'function'
              ? options.drawerLabel({ focused, color: '#111' })
              : options.drawerLabel ?? options.title ?? route.name;

          // Hide auth entries from the drawer menu
          if (route.name === 'Вход' || route.name === 'Регистрация' || route.name === 'Профиль') {
            return null;
          }

          if (route.name === 'Карта') {
            return (
              <DrawerItem
                key={route.key}
                label={label}
                focused={focused}
                style={styles.item}
                labelStyle={styles.label}
                icon={() => (
                  <View style={{ marginLeft: 8, marginRight: -8 }}>
                    <Ionicons name={getIconName(route.name)} size={20} color={'#8a8a8a'} />
                  </View>
                )}
                onPress={() => {
                  if (focused) {
                    navigation.closeDrawer();
                  } else {
                    const currentRoute = state.routes[state.index].name;
                    navigation.closeDrawer();
                    // Небольшая задержка чтобы drawer закрылся перед анимацией
                    setTimeout(() => {
                      // Переходим через мост внутри текущего стека для анимированного выхода на карту
                      navigation.navigate(currentRoute, { screen: 'BridgeToHome' });
                    }, 100);
                  }
                }}
              />
            );
          }

          return (
            <DrawerItem
              key={route.key}
              label={label}
              focused={focused}
              style={styles.item}
              labelStyle={styles.label}
              icon={() => (
                <View style={{ marginLeft: 8, marginRight: -8 }}>
                  <Ionicons name={getIconName(route.name)} size={20} color={'#8a8a8a'} />
                </View>
              )}
              onPress={() => {
                if (route.name === 'Настройки') {
                  // Always open the Settings root, not the last visited (e.g., Profile)
                  navigation.closeDrawer();
                  // Небольшая задержка чтобы drawer закрылся перед анимацией
                  setTimeout(() => {
                    navigation.navigate('Настройки', { screen: 'Settings' });
                  }, 100);
                } else {
                  navigation.closeDrawer();
                  // Небольшая задержка чтобы drawer закрылся перед анимацией
                  setTimeout(() => {
                    navigation.navigate(route.name);
                  }, 100);
                }
              }}
            />
          );
        })}
      </DrawerContentScrollView>
    );
  }

  return (
    <Drawer.Navigator 
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        drawerType: 'front',
        drawerPosition: 'right',
        drawerStyle: {
          width: 280,
        },
        overlayColor: 'rgba(0, 0, 0, 0.5)',
        sceneContainerStyle: { backgroundColor: 'transparent' },
        // Держим все экраны в памяти (как на сайтах)
        unmountOnBlur: false,
        // Используем кастомный рендер с анимациями
        cardStyleInterpolator: ({ current }) => ({
          cardStyle: {
            opacity: current.progress,
          },
        }),
      }}
    >
      <Drawer.Screen 
        name="Карта" 
        component={MapStack} 
        options={{ 
          headerShown: false,
          // Карта всегда в памяти
          unmountOnBlur: false,
        }} 
      />
      <Drawer.Screen 
        name="История заказов" 
        component={HistoryStack} 
        options={{ 
          headerShown: false, 
          title: 'История заказов',
          // Размонтировать при уходе чтобы не рендерилась
          unmountOnBlur: true,
        }} 
      />
      <Drawer.Screen 
        name="Настройки" 
        component={SettingsStack} 
        options={{ 
          headerShown: false, 
          title: 'Настройки',
          unmountOnBlur: true,
        }} 
      />
      <Drawer.Screen 
        name="Информация" 
        component={InfoStack} 
        options={{ 
          headerShown: false, 
          title: 'Информация',
          unmountOnBlur: true,
        }} 
      />
      <Drawer.Screen 
        name="Служба поддержки" 
        component={SupportStack} 
        options={{ 
          headerShown: false, 
          title: 'Служба поддержки',
          unmountOnBlur: true,
        }} 
      />
      <Drawer.Screen 
        name="Вход" 
        component={LoginStack} 
        options={{ 
          headerShown: false, 
          title: 'Вход',
          unmountOnBlur: true,
        }} 
      />
      <Drawer.Screen 
        name="Регистрация" 
        component={RegisterStack} 
        options={{ 
          headerShown: false, 
          title: 'Регистрация',
          unmountOnBlur: true,
        }} 
      />
  {/* Hidden route to open Profile directly */}
  <Drawer.Screen 
    name="Профиль" 
    component={ProfileStack} 
    options={{ 
      headerShown: false, 
      title: 'Профиль', 
      drawerItemStyle: { display: 'none' },
      unmountOnBlur: true,
    }} 
  />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    opacity: 1,
    zIndex: 9999,
  },
});
