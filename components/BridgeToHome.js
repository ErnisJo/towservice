import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

export default function BridgeToHome({ navigation }) {
  useEffect(() => {
    // Дожидаемся завершения анимации появления моста, затем переключаем дровер и закрываем мост
    const unsub = navigation.addListener('transitionEnd', (e) => {
      if (!e?.data?.closing) {
        const parent = navigation.getParent?.();
        parent?.navigate('Карта');
        setTimeout(() => {
          if (navigation.canGoBack?.()) navigation.goBack();
        }, 50);
      }
    });
    return unsub;
  }, [navigation]);

  return (
    <View style={styles.center} />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
});
