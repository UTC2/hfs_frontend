import React, { useState } from 'react'
import PropTypes from 'prop-types'
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useDispatch, useSelector } from 'react-redux'
import Button from 'components/Button'
import { colors } from 'theme'
import { login, clearError } from 'slices/auth.slice'

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.lightGrayPurple,
  },
  title: {
    fontSize: 28,
    marginBottom: 24,
    textAlign: 'center',
    color: colors.darkPurple,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  errorBanner: {
    backgroundColor: '#fee',
    color: colors.pink,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  link: {
    color: colors.purple,
    marginTop: 16,
    textAlign: 'center',
  },
})

const Login = ({ navigation }) => {
  const dispatch = useDispatch()
  const { status, error } = useSelector((s) => s.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const isLoading = status === 'loading'

  const onSubmit = () => {
    dispatch(login({ email: email.trim(), password }))
  }

  const onChangeEmail = (t) => {
    setEmail(t)
    if (error) dispatch(clearError())
  }

  const onChangePassword = (t) => {
    setPassword(t)
    if (error) dispatch(clearError())
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Sign in</Text>
      {!!error && <Text style={styles.errorBanner}>{error}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={onChangeEmail}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={onChangePassword}
        editable={!isLoading}
      />
      <Button
        title={isLoading ? '' : 'Sign in'}
        color="white"
        backgroundColor={colors.purple}
        onPress={onSubmit}
      >
        {isLoading && <ActivityIndicator color="white" />}
      </Button>
      <TouchableOpacity
        onPress={() => navigation.navigate('Register')}
        disabled={isLoading}
      >
        <Text style={styles.link}>Don&apos;t have an account? Register</Text>
      </TouchableOpacity>
    </View>
  )
}

Login.propTypes = {
  navigation: PropTypes.shape({ navigate: PropTypes.func }),
}

Login.defaultProps = {
  navigation: { navigate: () => null },
}

export default Login
