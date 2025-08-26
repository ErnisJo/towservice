import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../components/HomeScreen';
import HistoryScreen from '../components/HistoryScreen';
import SettingsScreen from '../components/SettingsScreen';
import InfoScreen from '../components/InfoScreen';
import SupportScreen from '../components/SupportScreen';
import RequestForm from '../components/RequestForm';
const Drawer = createDrawerNavigator();
const Stack = createStackNavigator();

function MapStack() {
  return (
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'Карта',
          headerLeft: () => (
            <Ionicons
              name="menu"
              size={24}
              color="#111"
              style={{ marginLeft: 12 }}
              onPress={() => navigation.getParent()?.openDrawer()}
            />
          ),
        })}
      />
      <Stack.Screen name="Request" component={RequestForm} options={{ title: 'Заявка' }} />
    </Stack.Navigator>
  );
}

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator>
      <Drawer.Screen name="Карта" component={MapStack} options={{ headerShown: false }} />
      <Drawer.Screen name="История заказов" component={HistoryScreen} options={{ title: 'История заказов' }} />
      <Drawer.Screen name="Настройки" component={SettingsScreen} options={{ title: 'Настройки' }} />
      <Drawer.Screen name="Информация" component={InfoScreen} options={{ title: 'Информация' }} />
      <Drawer.Screen name="Служба поддержки" component={SupportScreen} options={{ title: 'Служба поддержки' }} />
    </Drawer.Navigator>
  );
}
