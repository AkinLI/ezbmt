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
import HomeScreen from './screens/HomeScreen';
import ClubHomeScreen from './screens/ClubHomeScreen';
import ClubsScreen from './screens/ClubsScreen';
import ClubDashboardScreen from './screens/ClubDashboardScreen';
import BuddiesScreen from './screens/BuddiesScreen';
import SessionsScreen from './screens/SessionsScreen';
import SessionCheckInScreen from './screens/SessionCheckInScreen';
import SessionPairingScreen from './screens/SessionPairingScreen';
import ClubScoreboardScreen from './screens/ClubScoreboardScreen';
import ClubChatScreen from './screens/ClubChatScreen';
import ClubMediaScreen from './screens/ClubMediaScreen';
import PairingScreen from './screens/PairingScreen';
import ClubBoardScreen from './screens/ClubBoardScreen';
import ClubStatsScreen from './screens/ClubStatsScreen';
import ClubMembersScreen from './screens/ClubMembersScreen'; 
import QuickScoreboardScreen from './screens/QuickScoreboardScreen';
import AdminModerationScreen from './screens/AdminModerationScreen'; 
import WebCamScreen from './screens/WebCamScreen';
import WebCamViewerScreen from './screens/WebCamViewerScreen';
import ClubAudienceBoardScreen from './screens/ClubAudienceBoardScreen';
import SessionSignupsScreen from './screens/SessionSignupsScreen';
import ClubPostsScreen from './screens/ClubPostsScreen';
import ClubJoinRequestsScreen from './screens/ClubJoinRequestsScreen';
import ClubPollsScreen from './screens/ClubPollsScreen';
import ClubPollDetailScreen from './screens/ClubPollDetailScreen';
import ClubEventsScreen from './screens/ClubEventsScreen';
import ClubEventDetailScreen from './screens/ClubEventDetailScreen';
import ClubFeesScreen from './screens/ClubFeesScreen';
import ClubFeeDetailScreen from './screens/ClubFeeDetailScreen';
import ClubFeeReportScreen from './screens/ClubFeeReportScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
const headerDark = React.useMemo(() => ({
headerStyle: { backgroundColor: '#111' },   // 標題列底色
headerTitleStyle: { color: '#fff' },        // 標題文字
headerTintColor: '#fff',                    // 返回箭頭/右上角按鈕顏色
headerShadowVisible: false,                 // 移除底部陰影（更貼近深色）
// 若 iOS 想做霧面可用：headerBlurEffect: 'systemChromeMaterialDark'
}), []);
return (
<Stack.Navigator
initialRouteName="Events"
screenOptions={{ headerBackTitle: '', ...headerDark }}
>
{BACKEND === 'supabase' && (
<Stack.Screen name="Auth" component={AuthScreen} options={{ title: '登入' }} />
)}
<Stack.Screen name="Home" component={HomeScreen} options={{ title: '首頁', headerBackVisible: false }} />
<Stack.Screen name="ClubHome" component={ClubHomeScreen} options={{ title: '社團管理' }} />
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
<Stack.Screen name="Clubs" component={ClubsScreen} options={{ title: '我的社團' }} />
<Stack.Screen name="ClubDashboard" component={ClubDashboardScreen} options={{ title: '社團主頁' }} />
<Stack.Screen name="Buddies" component={BuddiesScreen} options={{ title: '球友名單' }} />
<Stack.Screen name="Sessions" component={SessionsScreen} options={{ title: '場次' }} />
<Stack.Screen name="SessionCheckIn" component={SessionCheckInScreen} options={{ title: '報到名單' }} />
<Stack.Screen name="SessionPairing" component={SessionPairingScreen} options={{ title: '排點' }} />
<Stack.Screen name="ClubScoreboard" component={ClubScoreboardScreen} options={{ title: '計分板' }} />
<Stack.Screen name="ClubChat" component={ClubChatScreen} options={{ title: '社團聊天室' }} />
<Stack.Screen name="ClubMedia" component={ClubMediaScreen} options={{ title: '社團媒體' }} />
<Stack.Screen name="ClubPairing" component={PairingScreen} options={{ title: '社團排點' }} />
<Stack.Screen name="ClubBoard" component={ClubBoardScreen} options={{ title: '看板' }} />
<Stack.Screen name="ClubStats" component={ClubStatsScreen} options={{ title: '社團統計' }} />
 <Stack.Screen name="ClubMembers" component={ClubMembersScreen} options={{ title: '社團成員' }} />
 <Stack.Screen name="QuickScoreboard" component={QuickScoreboardScreen} options={{ title: '快速計分板' }} />
 {/* 新增：最大管理者的社群管理 */}
<Stack.Screen name="AdminModeration" component={AdminModerationScreen} options={{ title: '社群管理（管理者）' }} />
<Stack.Screen name="WebCam" component={WebCamScreen} options={{ title: 'WEB CAM' }} />
<Stack.Screen name="WebCamViewer" component={WebCamViewerScreen} options={{ title: '觀看 CAM' }} />
<Stack.Screen name="ClubBoardAudience" component={ClubAudienceBoardScreen} options={{ title: '看板（唯讀）' }} />
<Stack.Screen name="SessionSignups" component={SessionSignupsScreen} options={{ title: '報名/候補名單' }} />
<Stack.Screen name="ClubPosts" component={ClubPostsScreen} options={{ title: '公告/貼文' }} />
<Stack.Screen name="ClubJoinRequests" component={ClubJoinRequestsScreen} options={{ title: '加入申請審核' }} />
<Stack.Screen name="ClubPolls" component={ClubPollsScreen} options={{ title: '社團投票' }} />
<Stack.Screen name="ClubPollDetail" component={ClubPollDetailScreen} options={{ title: '投票' }} />
<Stack.Screen name="ClubEvents" component={ClubEventsScreen} options={{ title: '社團活動' }} />
<Stack.Screen name="ClubEventDetail" component={ClubEventDetailScreen} options={{ title: '活動' }} />
<Stack.Screen name="ClubFees" component={ClubFeesScreen} options={{ title: '社團收費' }} />
<Stack.Screen name="ClubFeeDetail" component={ClubFeeDetailScreen} options={{ title: '費用明細' }} />
<Stack.Screen name="ClubFeeReport" component={ClubFeeReportScreen} options={{ title: '收費報表' }} />
</Stack.Navigator>
);
}