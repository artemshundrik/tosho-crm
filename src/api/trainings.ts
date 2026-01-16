import { supabase } from '../lib/supabaseClient';
import type { AttendanceStatus, Training } from '../types/trainings';

type CreateTrainingPayload = {
  team_id: string;
  date: string;
  time: string;
  type: Training['type'];
  sparring_opponent?: string | null;
  sparring_logo_url?: string | null;
  location?: string | null;
  comment?: string;
};

export async function getTrainings(teamId: string) {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .eq('team_id', teamId)
    .order('date', { ascending: false })
    .order('time', { ascending: false });
  if (error) throw error;
  return (data || []) as Training[];
}

export async function getTrainingById(trainingId: string) {
  const { data, error } = await supabase.from('trainings').select('*').eq('id', trainingId).single();
  if (error) throw error;
  return data as Training;
}

export async function createTraining(payload: CreateTrainingPayload) {
  const { data, error } = await supabase.from('trainings').insert(payload).select('*').single();
  if (error) throw error;
  return data as Training;
}

export async function updateTraining(trainingId: string, data: Partial<CreateTrainingPayload>) {
  const { data: updated, error } = await supabase
    .from('trainings')
    .update(data)
    .eq('id', trainingId)
    .select('*')
    .single();
  if (error) throw error;
  return updated as Training;
}

export async function getLastTrainingForTeam(teamId: string) {
  const { data, error } = await supabase
    .from('trainings')
    .select('*')
    .eq('team_id', teamId)
    .order('date', { ascending: false })
    .order('time', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 no rows
  return data as Training | null;
}

export async function deleteTraining(trainingId: string) {
  const { error } = await supabase.from('trainings').delete().eq('id', trainingId);
  if (error) throw error;
}

export async function getAttendance(trainingId: string) {
  const { data, error } = await supabase
    .from('training_attendance')
    .select('training_id, player_id, status, comment')
    .eq('training_id', trainingId);
  if (error) throw error;
  return data || [];
}

export async function deleteAttendance(trainingId: string, playerId: string) {
  const { error } = await supabase
    .from('training_attendance')
    .delete()
    .eq('training_id', trainingId)
    .eq('player_id', playerId);
  if (error) throw error;
}

export async function setAttendance(
  trainingId: string,
  playerId: string,
  status: AttendanceStatus,
  comment?: string,
) {
  const { data, error } = await supabase
    .from('training_attendance')
    .upsert({ training_id: trainingId, player_id: playerId, status, comment })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function bulkSetAttendance(
  trainingId: string,
  updates: { playerId: string; status: AttendanceStatus; comment?: string }[],
) {
  const payload = updates.map((u) => ({
    training_id: trainingId,
    player_id: u.playerId,
    status: u.status,
    comment: u.comment,
  }));
  const { data, error } = await supabase.from('training_attendance').upsert(payload);
  if (error) throw error;
  return data;
}
