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
import { register, clearError } from 'slices/auth.slice'

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  half: { flex: 1 },
  spacer: { width: 8 },
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

const Register = ({ navigation }) => {
  const dispatch = useDispatch()
  const { status, error } = useSelector((s) => s.auth)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localErr, setLocalErr] = useState(null)

  const isLoading = status === 'loading'

  const onSubmit = () => {
    if (password !== confirm) {
      setLocalErr('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setLocalErr('Password must be at least 8 characters')
      return
    }
    setLocalErr(null)
    dispatch(
      register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      }),
    )
  }

  const onChangeEmail = (t) => {
    setEmail(t)
    if (error) dispatch(clearError())
  }

  const visibleError = localErr || error

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Create account</Text>
      {!!visibleError && <Text style={styles.errorBanner}>{visibleError}</Text>}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="First name"
          value={firstName}
          onChangeText={setFirstName}
          editable={!isLoading}
        />
        <View style={styles.spacer} />
        <TextInput
          style={[styles.input, styles.half]}
          placeholder="Last name"
          value={lastName}
          onChangeText={setLastName}
          editable={!isLoading}
        />
      </View>
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
        onChangeText={setPassword}
        editable={!isLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm password"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
        editable={!isLoading}
      />
      <Button
        title={isLoading ? '' : 'Create account'}
        color="white"
        backgroundColor={colors.purple}
        onPress={onSubmit}
      >
        {isLoading && <ActivityIndicator color="white" />}
      </Button>
      <TouchableOpacity
        onPress={() => navigation.navigate('Login')}
        disabled={isLoading}
      >
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  )
}

Register.propTypes = {
  navigation: PropTypes.shape({ navigate: PropTypes.func }),
}

Register.defaultProps = {
  navigation: { navigate: () => null },
}

export default Register
