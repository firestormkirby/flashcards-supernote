/**
 * Cards — root component. PluginHost renders this full-screen when the panel
 * opens (see index.js for the buttons that open it).
 *
 * @format
 */

import React from 'react';
import {Text, View} from 'react-native';
import Root from './src/ui/Root';

interface State {
  error: Error | null;
}

/** A crash shows what went wrong instead of a blank panel that can't be closed. */
class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  State
> {
  state: State = {error: null};
  static getDerivedStateFromError(error: Error): State {
    return {error};
  }
  componentDidCatch(error: Error) {
    console.error('[cards] render crash', error);
  }
  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 24,
            backgroundColor: '#FFFFFF',
          }}>
          <Text
            style={{
              color: '#000000',
              fontSize: 20,
              fontWeight: '700',
              textAlign: 'center',
            }}>
            Something went wrong
          </Text>
          <Text
            style={{
              color: '#000000',
              fontSize: 15,
              textAlign: 'center',
              marginTop: 10,
            }}>
            {this.state.error.message}
          </Text>
          <Text
            onPress={() => this.setState({error: null})}
            style={{
              color: '#000000',
              fontSize: 18,
              textAlign: 'center',
              marginTop: 24,
              textDecorationLine: 'underline',
            }}>
            Try again
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  );
}
