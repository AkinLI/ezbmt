import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import EventsScreen from './screens/EventsScreen';
import MatchesScreen from './screens/MatchesScreen';
import PlayerSetupScreen from './screens/PlayerSetupScreen';
import RecordScreen from './screens/RecordScreen';
import AnalysisScreen from './screens/AnalysisScreen';
import LiveScreen from './screens/LiveScreen';
import ChatScreen from './screens/ChatScreen';
import MediaScreen from './screens/MediaScreen';
import SettingsScreen from './screens/SettingsScreen';
import ReplayScreen from './screens/ReplayScreen';
import AuthScreen from './screens/AuthScreen';
import { BACKEND } from './lib/backend';
import JoinEventScreen from './screens/JoinEventScreen';
import ProfileScreen from './screens/ProfileScreen';
import EventMembersScreen from './screens/EventMembersScreen';
import MatchMembersScreen from './screens/MatchMembersScreen';
import SpeedCam from './screens/SpeedCamScreen';


const Stack = createNativeStackNavigator();

export default function AppNavigator() {
return (
<Stack.Navigator
initialRouteName="Events"
// native-stack 不支援 headerBackTitleVisible，改用 headerBackTitle: ''
screenOptions={{ headerBackTitle: '' }}
>
{BACKEND === 'supabase' && (
<Stack.Screen name="Auth" component={AuthScreen} options={{ title: '登入' }} />
)}
<Stack.Screen name="JoinEvent" component={JoinEventScreen} options={{ title: '加入事件' }} />
<Stack.Screen name="Profile" component={ProfileScreen} options={{ title: '個人' }} />
<Stack.Screen name="EventMembers" component={EventMembersScreen} options={{ title: '事件成員' }} />
<Stack.Screen name="MatchMembers" component={MatchMembersScreen} options={{ title: '場次成員' }} />
<Stack.Screen name="Events" component={EventsScreen} options={{ title: '賽事' }} />
<Stack.Screen name="Matches" component={MatchesScreen} options={{ title: '場次' }} />
<Stack.Screen name="PlayerSetup" component={PlayerSetupScreen} options={{ title: '球員與起始設定' }} />
<Stack.Screen name="Record" component={RecordScreen} options={{ title: '記錄' }} />
<Stack.Screen name="Analysis" component={AnalysisScreen} options={{ title: '分析' }} />
<Stack.Screen name="Live" component={LiveScreen} options={{ title: '即時分數' }} />
<Stack.Screen name="Chat" component={ChatScreen} options={{ title: '聊天室' }} />
<Stack.Screen name="Media" component={MediaScreen} options={{ title: '媒體' }} />
<Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '設定' }} />
<Stack.Screen name="Replay" component={ReplayScreen} options={{ title: '路徑回放' }} />
<Stack.Screen name="SpeedCam" component={SpeedCam} options={{ title: '測速' }} />
</Stack.Navigator>
);
}