import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { FlowLog } from '../types/bed.types';
import { COLORS } from '../constants/colors';

interface FlowChartProps {
  data: FlowLog[];
  targetRate: number;
}

export const FlowChart: React.FC<FlowChartProps> = ({ data, targetRate }) => {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No data yet</Text> 
      </View>
    ); // [cite: 633]
  }

  // Determine line color based on latest reading [cite: 632]
  const latestRate = data[data.length - 1]?.dropsPerMin || 0;
  const isZero = latestRate === 0;
  const lineColor = isZero ? COLORS.critical : COLORS.stable;

  // Format X-axis labels to only show every 10th reading to avoid crowding [cite: 629]
  const labels = data.map((log, index) => {
    if (index % 10 === 0 || index === data.length - 1) {
      const date = new Date(log.recordedAt);
      return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return '';
  });

  const chartData = data.map(log => log.dropsPerMin);
  
  // Create a flat array of the target rate to draw the dashed target line 
  const targetData = data.map(() => targetRate);

  return (
    <View style={styles.container}>
      <LineChart
        data={{
          labels,
          datasets: [
            {
              data: chartData,
              color: () => lineColor,
              strokeWidth: 2,
            },
            {
              data: targetData,
              color: () => COLORS.textMuted, // Target line color
              strokeWidth: 2,
              withDots: false,
              strokeDashArray: [5, 5], // Makes it dashed
            }
          ],
        }}
        width={Dimensions.get('window').width - 64} // padding adjustment
        height={220}
        yAxisSuffix=""
        withInnerLines={true}
        withVerticalLines={false}
        chartConfig={{
          backgroundColor: COLORS.bgCard,
          backgroundGradientFrom: COLORS.bgCard,
          backgroundGradientTo: COLORS.bgCard,
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(26, 26, 46, ${opacity * 0.2})`, // grid lines
          labelColor: (opacity = 1) => `rgba(102, 102, 102, ${opacity})`,
          propsForDots: {
            r: '2',
            strokeWidth: '1',
            stroke: lineColor,
          },
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 16,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 8,
  },
});