import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { createStackNavigator, CardStyleInterpolators, TransitionSpecs } from '@react-navigation/stack';
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

function MapStack() {
  return (
  <Stack.Navigator initialRouteName="Home" screenOptions={{ gestureEnabled: true, animationEnabled: true, cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS, transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec } }}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'Карта',
      headerLeft: () => (<MenuButton navigation={navigation} />),
        })}
      />
  {/* Удалили страницу заявки. Заявка создаётся на карте. */}
    </Stack.Navigator>
  );
}

function HistoryStack() {
  return (
    <Stack.Navigator
      initialRouteName="History"
      screenOptions={({ navigation }) => ({
        gestureEnabled: true,
        animationEnabled: true,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'История заказов' }} />
      <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} options={{ title: 'Детали заказа' }} />
    </Stack.Navigator>
  );
}

function SettingsStack() {
  return (
    <Stack.Navigator
      initialRouteName="Settings"
      screenOptions={({ navigation }) => ({
        gestureEnabled: true,
        animationEnabled: true,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
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
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
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

function InfoStack() {
  return (
    <Stack.Navigator
      initialRouteName="Info"
      screenOptions={({ navigation }) => ({
        gestureEnabled: true,
        animationEnabled: true,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Info" component={InfoScreen} options={{ title: 'Информация' }} />
    </Stack.Navigator>
  );
}

function SupportStack() {
  return (
    <Stack.Navigator
      initialRouteName="Support"
      screenOptions={({ navigation }) => ({
        gestureEnabled: true,
        animationEnabled: true,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Support" component={SupportScreen} options={{ title: 'Служба поддержки' }} />
    </Stack.Navigator>
  );
}


function LoginStack() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={({ navigation }) => ({
        gestureEnabled: true,
        animationEnabled: true,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Вход' }} />
    </Stack.Navigator>
  );
}

function RegisterStack() {
  return (
    <Stack.Navigator
      initialRouteName="Register"
      screenOptions={({ navigation }) => ({
        gestureEnabled: true,
        animationEnabled: true,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
    headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Регистрация' }} />
    </Stack.Navigator>
  );
}

// Dedicated stack to open Profile directly (avoids passing through Settings)
function ProfileStack() {
  return (
    <Stack.Navigator
      initialRouteName="Profile"
      screenOptions={({ navigation }) => ({
        gestureEnabled: true,
        animationEnabled: true,
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
        headerLeft: () => (<BackButton navigation={navigation} />),
      })}
    >
      <Stack.Screen
        name="BridgeToHome"
        component={BridgeToHome}
        options={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          transitionSpec: { open: TransitionSpecs.TransitionIOSSpec, close: TransitionSpecs.TransitionIOSSpec },
          cardStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Профиль' }} />
    </Stack.Navigator>
  );
}

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
                  if (focused) navigation.closeDrawer();
                  else {
                    const currentRoute = state.routes[state.index].name;
                    navigation.closeDrawer();
                    // Переходим через мост внутри текущего стека для анимированного выхода на карту
                    navigation.navigate(currentRoute, { screen: 'BridgeToHome' });
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
                  navigation.navigate('Настройки', { screen: 'Settings' });
                } else {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </DrawerContentScrollView>
    );
  }

  return (
    <Drawer.Navigator drawerContent={(props) => <CustomDrawerContent {...props} />}>
      <Drawer.Screen name="Карта" component={MapStack} options={{ headerShown: false }} />
      <Drawer.Screen name="История заказов" component={HistoryStack} options={{ headerShown: false, title: 'История заказов' }} />
      <Drawer.Screen name="Настройки" component={SettingsStack} options={{ headerShown: false, title: 'Настройки' }} />
      <Drawer.Screen name="Информация" component={InfoStack} options={{ headerShown: false, title: 'Информация' }} />
      <Drawer.Screen name="Служба поддержки" component={SupportStack} options={{ headerShown: false, title: 'Служба поддержки' }} />
      <Drawer.Screen name="Вход" component={LoginStack} options={{ headerShown: false, title: 'Вход' }} />
      <Drawer.Screen name="Регистрация" component={RegisterStack} options={{ headerShown: false, title: 'Регистрация' }} />
  {/* Hidden route to open Profile directly */}
  <Drawer.Screen name="Профиль" component={ProfileStack} options={{ headerShown: false, title: 'Профиль', drawerItemStyle: { display: 'none' } }} />
    </Drawer.Navigator>
  );
}
