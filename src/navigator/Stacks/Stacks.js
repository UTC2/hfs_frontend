import React from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { colors } from 'theme'
import DetailScreen from '../../pages/Details'
// eslint-disable-next-line import/no-unresolved
import HomeScreen from '../../pages/Home/Home'
import Profile from '../../pages/Profile'
import HeaderLeft from './HeaderLeft'
import HeaderTitle from './HeaderTitle'
import MessageScreen from '../../pages/Message/index'
// ------------------------------------
// Constants
// ------------------------------------

const Stack = createStackNavigator()

const navigationProps = {
  headerTintColor: 'white',
  headerStyle: { backgroundColor: colors.darkPurple },
  headerTitleStyle: { fontSize: 18 },
}

// ------------------------------------
// Navigators
// ------------------------------------

export const HomeNavigator = () => (
  <Stack.Navigator
    initialRouteName="Home"
    headerMode="screen"
    screenOptions={navigationProps}
  >
    <Stack.Screen
      name="Home"
      component={HomeScreen}
      options={({ navigation }) => ({
        title: 'Home',
        headerLeft: () => <HeaderLeft navigation={navigation} />,
        headerTitle: () => <HeaderTitle />,
      })}
    />
    <Stack.Screen
      name="DetailScreen"
      component={DetailScreen}
      options={({ navigation }) => ({
        title: 'MessageScreen',
        headerLeft: () => <HeaderLeft navigation={navigation} />,
        headerTitle: () => <HeaderTitle />,
      })}
    />
    <Stack.Screen
      name="MessageScreen"
      component={MessageScreen}
      options={({ navigation }) => ({
        title: 'MessageScreen',
        headerLeft: () => <HeaderLeft navigation={navigation} />,
        headerTitle: () => <HeaderTitle />,
      })}
    />
  </Stack.Navigator>
)

export const ProfileNavigator = () => (
  <Stack.Navigator
    initialRouteName="Profile"
    headerMode="screen"
    screenOptions={navigationProps}
  >
    <Stack.Screen
      name="Profile"
      component={Profile}
      options={({ navigation }) => ({
        title: 'Profile',
        headerLeft: () => <HeaderLeft navigation={navigation} />,
        headerTitle: () => <HeaderTitle />,
      })}
    />
    <Stack.Screen
      name="DetailScreen"
      component={DetailScreen}
      options={{
        title: 'Details',
      }}
    />
    <Stack.Screen
      name="MessageScreen"
      component={MessageScreen}
      options={{
        title: 'MessageScreen',
      }}
    />
  </Stack.Navigator>
)
export const MessageNavigator = () => (
  <Stack.Navigator
    initialRouteName="MessageScreen"
    headerMode="screen"
    screenOptions={navigationProps}
  >
    <Stack.Screen
      name="MessageScreen"
      component={MessageScreen}
      options={({ navigation }) => ({
        title: 'MessageScreen',
        headerLeft: () => <HeaderLeft navigation={navigation} />,
        headerTitle: () => <HeaderTitle />,
      })}
    />
    <Stack.Screen
      name="DetailScreen"
      component={DetailScreen}
      options={{
        title: 'DetailScreen',
      }}
    />
    <Stack.Screen
      name="Home"
      component={HomeScreen}
      options={{
        title: 'Home',
      }}
    />
  </Stack.Navigator>
)
