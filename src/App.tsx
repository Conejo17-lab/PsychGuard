/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  MessageSquare, 
  UserRound, 
  LogOut, 
  Plus, 
  Clock, 
  ShieldCheck,
  ChevronRight,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc,
  serverTimestamp,
  orderBy,
  where
} from 'firebase/firestore';
import { format } from 'date-fns';
import { auth, db } from './lib/firebase';

// Types
type Role = 'admin' | 'psychologist' | 'patient';

interface UserProfile {
  uid: string;
  role: Role;
  name: string;
  email: string;
}

interface Session {
  id: string;
  patientId: string;
  psychologistId: string;
  patientName: string;
  psychologistName: string;
  startTime: any;
  endTime: any;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
}

interface Feedback {
  id: string;
  sessionId: string;
  patientId: string;
  patientName: string;
  moodBefore: string;
  moodAfter: string;
  complaints: string;
  timestamp: any;
}

interface Psychologist {
  id: string;
  name: string;
  specialization: string;
  patients: string[];
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sessions');
  
  // Data State
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Form states
  const [newSession, setNewSession] = useState({ patientName: '', startTime: '', endTime: '', psychologistId: '' });
  const [newFeedback, setNewFeedback] = useState({ sessionId: '', moodBefore: '', moodAfter: '', complaints: '' });

  const [sessions, setSessions] = useState<Session[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await addDoc(collection(db, 'sessions'), {
        patientId: 'manual-' + Math.random().toString(36).substr(2, 9),
        patientName: newSession.patientName,
        psychologistId: user.uid,
        psychologistName: user.displayName,
        startTime: new Date(`${format(new Date(), 'yyyy-MM-dd')}T${newSession.startTime}`),
        endTime: new Date(`${format(new Date(), 'yyyy-MM-dd')}T${newSession.endTime}`),
        status: 'scheduled'
      });
      setShowSessionModal(false);
      setNewSession({ patientName: '', startTime: '', endTime: '', psychologistId: '' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const session = sessions.find(s => s.id === newFeedback.sessionId);
      await addDoc(collection(db, 'feedbacks'), {
        ...newFeedback,
        patientId: user.uid,
        patientName: user.displayName,
        psychologistId: session?.psychologistId || '',
        timestamp: serverTimestamp()
      });
      setShowFeedbackModal(false);
      setNewFeedback({ sessionId: '', moodBefore: '', moodAfter: '', complaints: '' });
    } catch (err) {
      console.error(err);
    }
  };

  const seedData = async () => {
    if (userProfile?.role !== 'admin') return;
    
    // Seed Psychologists
    const psychs = [
      { name: 'Dr. Roberto Mental', specialization: 'Terapia Cognitivo-Comportamental', patients: ['pat1', 'pat2'] },
      { name: 'Dra. Ana Silveira', specialization: 'Psicanálise', patients: ['pat3'] }
    ];
    for (const p of psychs) {
      await addDoc(collection(db, 'psychologists'), p);
    }

    // Seed Sessions
    const mockSessions = [
      { patientName: 'Carlos Lima', psychologistName: 'Dr. Roberto Mental', startTime: new Date(), endTime: new Date(Date.now() + 3600000), status: 'completed' },
      { patientName: 'Maria Souza', psychologistName: 'Dra. Ana Silveira', startTime: new Date(), endTime: new Date(Date.now() + 3600000), status: 'in-progress' }
    ];
    for (const s of mockSessions) {
      await addDoc(collection(db, 'sessions'), s);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Fetch or Create Profile
        const profileDoc = await getDoc(doc(db, 'users', user.uid));
        if (profileDoc.exists()) {
          setUserProfile(profileDoc.data() as UserProfile);
        } else {
          // Default role is patient if not found
          const newProfile: UserProfile = {
            uid: user.uid,
            role: 'patient',
            name: user.displayName || 'Usuário',
            email: user.email || ''
          };
          await setDoc(doc(db, 'users', user.uid), newProfile);
          setUserProfile(newProfile);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userProfile) return;

    // Real-time listeners based on role
    let sessionsQuery;
    if (userProfile.role === 'admin') {
      sessionsQuery = query(collection(db, 'sessions'), orderBy('startTime', 'desc'));
    } else if (userProfile.role === 'psychologist') {
      sessionsQuery = query(collection(db, 'sessions'), where('psychologistId', '==', userProfile.uid), orderBy('startTime', 'desc'));
    } else {
      sessionsQuery = query(collection(db, 'sessions'), where('patientId', '==', userProfile.uid), orderBy('startTime', 'desc'));
    }

    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      const sessData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Session[];
      setSessions(sessData);
    }, (error) => console.error("Erro ao carregar sessões:", error));

    let feedbacksQuery;
    if (userProfile.role === 'admin') {
      feedbacksQuery = query(collection(db, 'feedbacks'), orderBy('timestamp', 'desc'));
    } else if (userProfile.role === 'psychologist') {
      feedbacksQuery = query(collection(db, 'feedbacks'), where('psychologistId', '==', userProfile.uid), orderBy('timestamp', 'desc'));
    } else {
      feedbacksQuery = query(collection(db, 'feedbacks'), where('patientId', '==', userProfile.uid), orderBy('timestamp', 'desc'));
    }

    const unsubscribeFeedbacks = onSnapshot(feedbacksQuery, (snapshot) => {
      const feedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Feedback[];
      setFeedbacks(feedData);
    }, (error) => console.error("Erro ao carregar feedbacks:", error));

    const psychologistsQuery = query(collection(db, 'psychologists'));
    const unsubscribePsychs = onSnapshot(psychologistsQuery, (snapshot) => {
      const psychData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Psychologist[];
      setPsychologists(psychData);
    });

    return () => {
      unsubscribeSessions();
      unsubscribeFeedbacks();
      unsubscribePsychs();
    };
  }, [userProfile]);

  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider);
  };

  const logout = () => signOut(auth);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }} 
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-slate-500 font-serif italic"
        >
          Carregando ambiente seguro...
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-12 rounded-[40px] shadow-sm text-center space-y-8 border border-slate-100"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-blue-900" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-serif font-medium text-slate-900">PsychGuard</h1>
            <p className="text-slate-500">Gestão Segura de Dados Clínicos</p>
          </div>
          <button 
            onClick={login}
            className="w-full bg-slate-900 text-white rounded-full py-4 font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
          >
            Acessar com Google
          </button>
          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 uppercase tracking-widest leading-loose">
              Proteção de dados em conformidade com normas LGPD e ética profissional
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col text-slate-900">
        <div className="p-8 pb-12">
          <h2 className="text-xl font-serif font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-900" />
            PsychGuard
          </h2>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <TabButton 
            active={activeTab === 'sessions'} 
            onClick={() => setActiveTab('sessions')}
            icon={<Calendar className="w-5 h-5" />}
            label="Sessões"
          />
          <TabButton 
            active={activeTab === 'feedbacks'} 
            onClick={() => setActiveTab('feedbacks')}
            icon={<MessageSquare className="w-5 h-5" />}
            label="Feedbacks"
          />
          <TabButton 
            active={activeTab === 'psychologists'} 
            onClick={() => setActiveTab('psychologists')}
            icon={<Users className="w-5 h-5" />}
            label="Psicólogos"
          />
        </nav>

        <div className="p-4 mt-auto">
          <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3 border border-slate-100">
            <div className="w-10 h-10 bg-slate-200 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{userProfile?.name}</p>
              <p className="text-xs text-slate-400 capitalize">{userProfile?.role}</p>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-slate-900 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-white/80 backdrop-blur-md border-bottom border-slate-200 px-8 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="md:hidden flex items-center gap-2">
             <ShieldCheck className="w-6 h-6 text-slate-900" />
             <span className="font-serif font-bold text-slate-900">PsychGuard</span>
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 hidden md:block">
            {activeTab === 'sessions' && 'Controle de Atendimento'}
            {activeTab === 'feedbacks' && 'Acompanhamento de Evolução'}
            {activeTab === 'psychologists' && 'Equipe Clínica'}
          </h2>
          <div className="flex items-center gap-4">
            <div className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase rounded-full tracking-wider border border-blue-100">
              Encrypted
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-y-auto">
          {userProfile?.role === 'admin' && sessions.length === 0 && (
            <div className="mb-8 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3 text-blue-800 text-sm">
                <AlertCircle className="w-5 h-5" />
                Deseja popular o banco de dados com dados de demonstração?
              </div>
              <button 
                onClick={seedData}
                className="text-xs font-bold uppercase tracking-widest text-blue-900 bg-blue-200/50 px-4 py-2 rounded-full hover:bg-blue-200 transition-colors"
              >
                Gerar Amostras
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {activeTab === 'sessions' && (
              <motion.div 
                key="sessions"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif font-medium text-slate-900">Horário de Consultas</h3>
                  {(userProfile?.role === 'admin' || userProfile?.role === 'psychologist') && (
                    <button 
                      onClick={() => setShowSessionModal(true)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-blue-700 transition-all shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Nova Sessão
                    </button>
                  )}
                </div>
                
                <div className="grid gap-4">
                  {sessions.length > 0 ? sessions.map(session => (
                    <div key={session.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between hover:shadow-md transition-shadow group">
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                          <UserRound className="w-6 h-6 text-blue-900 transition-colors" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{session.patientName || 'Paciente Anônimo'}</p>
                          <p className="text-sm text-slate-400 flex items-center gap-1">
                            Psicólogo: {session.psychologistName || 'Não atribuído'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-12">
                        <div className="text-right">
                          <p className="text-sm text-slate-400 uppercase tracking-tighter mb-1 text-[10px] font-bold">Entrada / Saída</p>
                          <div className="flex items-center gap-2 font-mono text-slate-700">
                            <Clock className="w-3 h-3 text-blue-900" />
                            <span>{session.startTime ? format(new Date(session.startTime.seconds * 1000), 'HH:mm') : '--:--'}</span>
                            <span className="text-slate-300">→</span>
                            <span>{session.endTime ? format(new Date(session.endTime.seconds * 1000), 'HH:mm') : '--:--'}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            session.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                            session.status === 'in-progress' ? 'bg-blue-50 text-blue-600' :
                            'bg-slate-50 text-slate-400'
                          }`}>
                            {session.status}
                          </span>
                          <ChevronRight className="w-5 h-5 text-slate-200" />
                        </div>
                      </div>
                    </div>
                  )) : (
                    <EmptyState 
                      icon={<Calendar className="w-12 h-12 text-slate-200" />}
                      message="Nenhuma sessão registrada para este período."
                    />
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'feedbacks' && (
              <motion.div 
                key="feedbacks"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif font-medium text-slate-900">Relatórios de Feedback</h3>
                  <div className="flex items-center gap-4">
                    {userProfile?.role === 'patient' && (
                      <button 
                        onClick={() => setShowFeedbackModal(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-sm hover:bg-blue-700"
                      >
                        <Plus className="w-4 h-4" /> Enviar Feedback
                      </button>
                    )}
                    <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold flex items-center gap-2">
                      <UserCheck className="w-4 h-4" /> Apenas Clinicos Autorizados
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {feedbacks.length > 0 ? feedbacks.map(feedback => (
                    <div key={feedback.id} className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6 group hover:border-blue-200 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-blue-900 text-white rounded-full flex items-center justify-center font-serif">
                             {feedback.patientName?.charAt(0) || 'P'}
                           </div>
                           <div>
                             <p className="font-semibold text-slate-900">{feedback.patientName || 'Anônimo'}</p>
                             <p className="text-xs text-slate-400">{feedback.timestamp ? format(new Date(feedback.timestamp.seconds * 1000), 'dd MMM, yyyy') : ''}</p>
                           </div>
                        </div>
                        <span className="text-xs bg-slate-50 text-slate-400 px-3 py-1 rounded-full">Consulta #{feedback.sessionId.slice(0, 5)}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-amber-50/50 p-4 rounded-3xl">
                          <p className="text-[10px] uppercase font-bold text-amber-600 mb-1 tracking-wider">Humor Pré-Sessão</p>
                          <p className="text-slate-700 italic">"{feedback.moodBefore}"</p>
                        </div>
                        <div className="bg-blue-50/50 p-4 rounded-3xl">
                          <p className="text-[10px] uppercase font-bold text-blue-600 mb-1 tracking-wider">Humor Pós-Sessão</p>
                          <p className="text-slate-700 italic">"{feedback.moodAfter}"</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Principais Queixas</p>
                        <p className="text-slate-600 leading-relaxed text-sm">
                          {feedback.complaints}
                        </p>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-full">
                      <EmptyState 
                        icon={<MessageSquare className="w-12 h-12 text-slate-200" />}
                        message="Sem feedbacks coletados no momento."
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'psychologists' && (
              <motion.div 
                key="psychologists"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-serif font-medium text-slate-900">Corpo Clínico</h3>
                  {userProfile?.role === 'admin' && (
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm transition-all">
                      <Plus className="w-4 h-4" /> Adicionar Profissional
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {psychologists.length > 0 ? psychologists.map(psych => (
                    <div key={psych.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div className="w-20 h-20 bg-blue-50 rounded-full border-4 border-white shadow-inner flex items-center justify-center">
                           <UserCheck className="w-8 h-8 text-blue-900" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-lg text-slate-900">{psych.name}</h4>
                          <p className="text-sm text-slate-400">{psych.specialization}</p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-3 text-xs uppercase tracking-widest text-slate-400 font-bold">
                          <span>Pacientes Designados</span>
                          <span>{psych.patients?.length || 0}</span>
                        </div>
                        <div className="space-y-1">
                           {psych.patients?.slice(0, 3).map((pat, i) => (
                             <div key={i} className="text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg">
                               Identificador: ...{pat.slice(-6)}
                             </div>
                           ))}
                           {psych.patients?.length > 3 && (
                             <div className="text-[10px] text-center text-slate-400 pt-1">
                               + {psych.patients.length - 3} outros pacientes
                             </div>
                           )}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="col-span-full">
                       <EmptyState 
                        icon={<Users className="w-12 h-12 text-slate-200" />}
                        message="Nenhum psicólogo cadastrado no sistema."
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Modals */}
        <AnimatePresence>
          {showSessionModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
               <motion.div 
                 initial={{ opacity: 0 }} 
                 animate={{ opacity: 1 }} 
                 exit={{ opacity: 0 }}
                 onClick={() => setShowSessionModal(false)}
                 className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" 
               />
               <motion.div 
                 initial={{ opacity: 0, scale: 0.9, y: 20 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.9, y: 20 }}
                 className="relative w-full max-w-lg bg-white rounded-[40px] p-12 shadow-2xl space-y-8"
               >
                 <h3 className="text-2xl font-serif font-medium text-slate-900">Agendar Atendimento</h3>
                 <form onSubmit={handleCreateSession} className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Nome do Paciente</label>
                       <input 
                         required
                         value={newSession.patientName}
                         onChange={(e) => setNewSession({...newSession, patientName: e.target.value})}
                         className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 ring-blue-600 outline-none"
                         placeholder="Ex: Ana Clara"
                       />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Hora Entrada</label>
                        <input 
                          required
                          type="time" 
                          value={newSession.startTime}
                          onChange={(e) => setNewSession({...newSession, startTime: e.target.value})}
                          className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 ring-blue-600 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Hora Saída</label>
                        <input 
                          required
                          type="time" 
                          value={newSession.endTime}
                          onChange={(e) => setNewSession({...newSession, endTime: e.target.value})}
                          className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 ring-blue-600 outline-none"
                        />
                      </div>
                    </div>
                    <button type="submit" className="w-full bg-slate-950 text-white rounded-full py-4 font-medium hover:bg-slate-900 shadow-lg">Criar Registro</button>
                 </form>
               </motion.div>
            </div>
          )}

          {showFeedbackModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
               <motion.div 
                 initial={{ opacity: 0 }} 
                 animate={{ opacity: 1 }} 
                 exit={{ opacity: 0 }}
                 onClick={() => setShowFeedbackModal(false)}
                 className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" 
               />
               <motion.div 
                 initial={{ opacity: 0, scale: 0.9, y: 20 }}
                 animate={{ opacity: 1, scale: 1, y: 0 }}
                 exit={{ opacity: 0, scale: 0.9, y: 20 }}
                 className="relative w-full max-w-lg bg-white rounded-[40px] p-12 shadow-2xl space-y-8"
               >
                 <h3 className="text-2xl font-serif font-medium text-slate-900">Como foi sua sessão?</h3>
                 <form onSubmit={handleCreateFeedback} className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Identificador da Sessão</label>
                       <select 
                         required
                         value={newFeedback.sessionId}
                         onChange={(e) => setNewFeedback({...newFeedback, sessionId: e.target.value})}
                         className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 ring-blue-600 outline-none"
                       >
                         <option value="">Selecione a sessão...</option>
                         {sessions.map(s => <option key={s.id} value={s.id}>{format(new Date(s.startTime.seconds * 1000), 'dd/MM')} - {s.psychologistName}</option>)}
                       </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Antes da Sessão</label>
                        <input 
                          required
                          placeholder="Ex: Ansioso"
                          value={newFeedback.moodBefore}
                          onChange={(e) => setNewFeedback({...newFeedback, moodBefore: e.target.value})}
                          className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 ring-blue-600 outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Depois da Sessão</label>
                        <input 
                          required
                          placeholder="Ex: Aliviado"
                          value={newFeedback.moodAfter}
                          onChange={(e) => setNewFeedback({...newFeedback, moodAfter: e.target.value})}
                          className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 ring-blue-600 outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Suas Queixas</label>
                       <textarea 
                         required
                         value={newFeedback.complaints}
                         onChange={(e) => setNewFeedback({...newFeedback, complaints: e.target.value})}
                         className="w-full bg-slate-50 border-none rounded-2xl p-4 focus:ring-2 ring-blue-600 outline-none min-h-[100px]"
                         placeholder="O que você trouxe para a sessão hoje?"
                       />
                    </div>
                    <button type="submit" className="w-full bg-slate-950 text-white rounded-full py-4 font-medium hover:bg-slate-900 shadow-lg">Enviar Relatório</button>
                 </form>
               </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
        active 
          ? 'bg-blue-50 text-blue-900 border border-blue-100 shadow-sm' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-blue-900'
      }`}
    >
      <div className={active ? 'text-blue-900' : 'text-slate-400 group-hover:text-blue-900'}>
        {icon}
      </div>
      <span className="font-medium">{label}</span>
      {active && (
        <motion.div 
          layoutId="active-pill"
          className="ml-auto w-1.5 h-1.5 bg-blue-900 rounded-full"
        />
      )}
    </button>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode, message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-[40px] text-center space-y-4 bg-white/50">
      {icon}
      <p className="text-slate-400 max-w-xs">{message}</p>
    </div>
  );
}
