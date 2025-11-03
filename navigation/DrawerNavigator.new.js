import React from 'react';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItem } from '@react-navigation/drawer';
import { TouchableOpacity, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import screens from new structure
import { HomeScreen } from '../components/core';
import { HistoryScreen, OrderDetailsScreen } from '../components/orders';
import { LoginScreen, RegisterScreen } from '../components/auth';
import { SupportScreen } from '../components/support';
import BridgeToHome from '../components/BridgeToHome';
import SettingsScreen from '../components/SettingsScreen';
import InfoScreen from '../components/InfoScreen';
import ProfileScreen from '../components/ProfileScreen';

// Rest of the original file content...