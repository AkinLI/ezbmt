import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/AppNavigator';
import { startSyncLoop, stopSyncLoop } from './src/lib/sync';

export default function App() {
React.useEffect(()=>{ startSyncLoop(); return ()=>stopSyncLoop(); },[]);    
const isDarkMode = useColorScheme() === 'dark';
return (
<SafeAreaProvider>
<StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
<NavigationContainer>
<AppNavigator />
</NavigationContainer>
</SafeAreaProvider>
);
}
