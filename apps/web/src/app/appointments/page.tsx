import { AppointmentCalendar } from '@/components/appointments/appointment-calendar';

export const metadata = {
  title: 'Appointment Calendar | CarePoint Clinic',
  description: 'View and track scheduled appointments by date and time.',
};

export default function AppointmentsPage() {
  return <AppointmentCalendar />;
}
