import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DrawerNavigator from './navigation/DrawerNavigator';
import { navigationRef } from './navigation/navigationRef';

export default function App() {
	return (
		<SafeAreaProvider>
			<NavigationContainer ref={navigationRef}>
				<DrawerNavigator />
			</NavigationContainer>
		</SafeAreaProvider>
	);
}
