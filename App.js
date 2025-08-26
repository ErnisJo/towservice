import 'react-native-gesture-handler';
import React, { useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import DrawerNavigator from './navigation/DrawerNavigator';
import { navigationRef } from './navigation/navigationRef';


export default function App() {
  enableScreens(true);
  const [currentRoute, setCurrentRoute] = useState('');
  const MyTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: '#0a84ff',
      background: '#ffffff',
      card: '#ffffff',
      text: '#111111',
      border: '#e6e6e6',
      notification: '#ff453a',
    },
  };
  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={MyTheme}
        ref={navigationRef}
        onReady={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? '')}
        onStateChange={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name ?? '')}
      >
        <View style={{ flex: 1 }}>
          <DrawerNavigator />
          {/* Глобальная кнопка Карта: скрыть на экране 'Карта' */}
          {/* Прячем на главной карте (вложенный экран 'Home'), показываем на остальных */}
          {currentRoute !== 'Home' && (
            <TouchableOpacity
              onPress={() => navigationRef.navigate('Карта', { screen: 'Home' })}
              activeOpacity={0.9}
              style={styles.fabCenter}
            >
              <Text style={styles.fabText}>Заказать</Text>
            </TouchableOpacity>
          )}
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fabCenter: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: -44 }],
    bottom: 16,
    width: 88,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#f7d307',
    borderWidth: 1,
    borderColor: '#f7d307',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    shadowColor: '#969494ff',
    
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: { color: '#fff', fontWeight: '900' ,textShadowColor: '#cdcbcbff',textShadowOffset: { width: 0, height: 1 },textShadowRadius: 1 },
});
