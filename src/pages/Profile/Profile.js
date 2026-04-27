import React from 'react'
import {
  StyleSheet, Text, View, Image, StatusBar,
} from 'react-native'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'components/Button'
import { colors } from 'theme'
import { logout } from 'slices/auth.slice'

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lightGrayPurple,
    paddingHorizontal: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    backgroundColor: '#ddd',
  },
  name: {
    fontSize: 24,
    marginBottom: 4,
    color: colors.darkPurple,
  },
  email: {
    fontSize: 16,
    marginBottom: 24,
    color: colors.gray,
  },
})

const Profile = () => {
  const dispatch = useDispatch()
  const user = useSelector((s) => s.auth.user)
  if (!user) return null
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'No name set'
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {user.avatar?.url ? (
        <Image source={{ uri: user.avatar.url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatar} />
      )}
      <Text style={styles.name}>{fullName}</Text>
      <Text style={styles.email}>{user.email}</Text>
      <Button
        title="Sign out"
        color="white"
        backgroundColor={colors.pink}
        onPress={() => dispatch(logout())}
      />
    </View>
  )
}

export default Profile
