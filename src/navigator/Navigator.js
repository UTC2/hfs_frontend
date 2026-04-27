import React, { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useSelector, useDispatch } from 'react-redux'
import { bootstrap } from 'slices/auth.slice'

import DrawerNavigator from './Drawer'
import AuthStack from './AuthStack'

const styles = {
  spinner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
}

const Navigator = () => {
  const dispatch = useDispatch()
  const { status, bootstrapped } = useSelector((s) => s.auth)

  useEffect(() => {
    dispatch(bootstrap())
  }, [dispatch])

  if (!bootstrapped) {
    return (
      <View style={styles.spinner}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {status === 'authed' ? <DrawerNavigator /> : <AuthStack />}
    </NavigationContainer>
  )
}

export default Navigator
