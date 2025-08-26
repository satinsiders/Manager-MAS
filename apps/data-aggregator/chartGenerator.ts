import fetch from 'node-fetch';
import { supabase } from '../../packages/shared/supabase';

export interface PerformancePoint {
  timestamp: string;
  score: number;
}

/**
 * Generates a line chart for a student's performance and uploads it to Supabase storage.
 * @param studentId - UUID of the student
 * @param points - Array of {timestamp, score}
 * @param safeTimestamp - timestamp string safe for file paths
 * @returns public URL of the uploaded chart image
 */
export async function generatePerformanceChart(
  studentId: string,
  points: PerformancePoint[],
  safeTimestamp: string
): Promise<string> {
  const chartConfig = {
    type: 'line',
    data: {
      labels: points.map((p) => new Date(p.timestamp).toLocaleDateString()),
      datasets: [
        {
          label: 'Score',
          data: points.map((p) => p.score),
          fill: false,
          borderColor: 'rgb(75, 192, 192)',
        },
      ],
    },
  };

  const url = `https://quickchart.io/chart?c=${encodeURIComponent(
    JSON.stringify(chartConfig)
  )}&format=png`;

  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const path = `charts/${studentId}_${safeTimestamp}.png`;
  await supabase.storage
    .from('summaries')
    .upload(path, buffer, { contentType: 'image/png', upsert: true });

  const { data } = supabase.storage.from('summaries').getPublicUrl(path);
  return data.publicUrl;
}
