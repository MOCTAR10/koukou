import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, ScrollView, TextInput as RNTextInput, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Calendar, Check, ChevronDown, Clock, Eye, Pill, Wheat, Zap, ShieldCheck, Syringe, TrendingUp, Warehouse } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { Sheet } from './ui/Sheet';
import { AppText } from './ui/AppText';
import { Button } from './ui/Button';
import { color, palette, radii } from '@/constants/theme';
import { SPECIES_IMAGES } from '@/constants/speciesImages';
import { BREED_IMAGES } from '@/constants/breedImages';
import { useAuth } from '@/auth/AuthContext';
import { createBatch, createTreatment } from '@/api/mutations';
import { invalidateFarmQueries } from '@/api/invalidate';
import { fetchBuildings, fetchBreeds, fetchBreedStandards, fetchProtocols, fetchSanitaryProgram } from '@/api';
import type { BatchType, Building, ProtocolStep, FeedPhase, Species } from '@/api/types';

type BatchInput = {
  batchName: string;
  integrationDate: string;
  quantityAtStart: number;
  type: BatchType;
  species?: Species;
  breedId?: string;
  customSpecies?: string;
  customBreed?: string;
  buildingId?: string;
  buildingAreaM2?: number;
  couvoirSupplier?: string;
  chickLotNumber?: string;
  hatchDate?: string;
  chickUnitPriceFcfa?: number;
  quantityAlive?: number;
};

function addDaysToDate(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Age lisible : semaines en premier, jours en reste (ex : "3 sem 2 j", "5 j"). */
function formatAge(days: number): string {
  if (days <= 0) return '';
  const weeks = Math.floor(days / 7);
  const rest = days % 7;
  if (weeks === 0) return `${days} j`;
  return `${weeks} sem${weeks > 1 ? 's' : ''}${rest > 0 ? ` ${rest} j` : ''}`;
}

/**
 * Breed descriptions — context for the farmer.
 * Couvre toutes les espèces (POULET, PINTADE, DINDE, CAILLE) pour que
 * la corrélation Espèce → Souche soit visible dans l'interface.
 */
const BREED_INFO: Record<string, { origin: string; cycle: string; trait: string }> = {
  // POULET — chair
  'Cobb 500': { origin: 'USA', cycle: '12 semaines', trait: 'Croissance rapide, IC performant, adapté à l\'intensif' },
  'Ross 308': { origin: 'UK', cycle: '12 semaines', trait: 'Bonne conversion alimentaire, chair de qualité' },
  'Ross 708': { origin: 'UK', cycle: '12 semaines', trait: 'Broiler lourd, rendement carcasse élevé, très robuste' },
  'Hubbard': { origin: 'France', cycle: '12 semaines', trait: 'Résistant, adapté aux climats chauds, chair ferme' },
  'Arbor Acres': { origin: 'USA', cycle: '12 semaines', trait: 'Poids lourd rapide, très répandue en Afrique de l\'Ouest' },
  'Sasso T451': { origin: 'France', cycle: '10–12 semaines', trait: 'Croissance lente, rustique, idéale en climat chaud et élevage villageois' },
  'Sasso X44': { origin: 'France', cycle: '10–12 semaines', trait: 'Croissance lente, plumage coloré, très répandue en Afrique' },
  'Cobb 700': { origin: 'USA', cycle: '12 semaines', trait: 'Croissance rapide, poids lourd supérieur au Cobb 500' },
  'Kuroiler': { origin: 'Kenya / Inde', cycle: '16–20 semaines', trait: 'Poule améliorée à double objet (chair + ponte), très rustique en plein air' },
  'Kienyeji': { origin: 'Kenya', cycle: '16–24 semaines', trait: 'Poule locale africaine, robuste, élevage villageois extensif' },
  'Poulet Goliath': { origin: 'Afrique centrale', cycle: '10–12 semaines', trait: 'Croisement rustique des marchés gabonais, croissance plus lente, chair ferme' },
  'Poulet Local Gabonais': { origin: 'Gabon (5 écotypes)', cycle: '20–24 semaines', trait: 'Race locale gabonaise (Nyembwe), croissance très lente, chair ferme très prisée, maximallement rustique' },
  'Poulet Local Gabonais (pondeuse)': { origin: 'Gabon (5 écotypes)', cycle: '60 semaines de ponte', trait: 'Ponte modérée (40–60 œufs/an), excellente couveuse, rusticité maximale' },
  // POULET — pondeuse
  'ISA Brown': { origin: 'France/NL', cycle: '72 semaines', trait: 'Pondeuse industrielle, pic à 93%, robuste' },
  'Lohmann Brown': { origin: 'Allemagne', cycle: '72 semaines', trait: 'Pondeuse colorée, excellemment adaptée aux tropiques' },
  'Lohmann White': { origin: 'Allemagne', cycle: '72 semaines', trait: 'Pondeuse blanche, excellente résistance à la chaleur' },
  'Hy-Line Brown': { origin: 'USA', cycle: '72 semaines', trait: 'Bonne persistance de ponte, coquille solide' },
  'Hy-Line White': { origin: 'USA', cycle: '72 semaines', trait: 'Pondeuse blanche, ponte élevée et coquille solide' },
  'Novogen Brown': { origin: 'France/NL', cycle: '72 semaines', trait: 'Pondeuse efficiente, œufs de qualité homogène' },
  'Bovans Brown': { origin: 'Pays-Bas', cycle: '72 semaines', trait: 'Pondeuse Hendrix polyvalente, pic jusqu\'à 95%' },
  'Shaver Brown': { origin: 'Canada', cycle: '72 semaines', trait: 'Pondeuse classique robuste, pic ~93%, bonne persistance' },
  'White Leghorn': { origin: 'Italie / USA', cycle: '72 semaines', trait: 'Pondeuse blanche légendaire, ponte élevée toute l\'année' },
  'Black Australorp': { origin: 'Australie', cycle: '72 semaines', trait: 'Pondeuse noire très productive (~250 œufs/an), double objet' },
  'Hisex Brown': { origin: 'Pays-Bas / Belgique', cycle: '72 semaines', trait: 'Pondeuse brune importée au Gabon, pic ~93%, robuste en climat chaud' },
  'Hisex White': { origin: 'Pays-Bas', cycle: '72 semaines', trait: 'Pondeuse blanche efficiente, petite taille, coquilles solides' },
  'Dekalb White': { origin: 'USA', cycle: '72 semaines', trait: 'Pondeuse blanche très précoce, excellente persistance en zone chaude' },
  'Dekalb Brown': { origin: 'USA', cycle: '72 semaines', trait: 'Pondeuse brune calme, gros œufs, bonne rusticité' },
  // PINTADE
  'Pintade Galor': { origin: 'France', cycle: '11–12 semaines', trait: 'Pintade de chair productive, poids homogène, chair goûteuse' },
  'Pintade Danube': { origin: 'Europe de l\'Est / France', cycle: '12–13 semaines', trait: 'Pintade lourde (2,3–2,8 kg), excellente rusticité' },
  'Pintade Numidia': { origin: 'Afrique de l\'Ouest', cycle: '12–14 semaines', trait: 'Pintade locale casquée, excellente rusticité, élevage villageois' },
  'Pintade Pondeuse': { origin: 'Sélection française', cycle: '60 semaines de ponte', trait: 'Pondeuse d\'œufs de pintade, fertilité et coquilles solides' },
  // DINDE
  'Dinde Bronze': { origin: 'USA / Royaume-Uni', cycle: '20–24 semaines', trait: 'Dinde lourde traditionnelle, plumage brun, très charnue' },
  'Dinde Blanche': { origin: 'USA', cycle: '18–20 semaines', trait: 'Dinde standard blanche, croissance rapide, gros rendement' },
  'Dinde Broad-Breasted White': { origin: 'USA', cycle: '18–20 semaines', trait: 'Dinde blanche standard d\'élevage, poitrine large, très productive' },
  'Dinde Bourbon Red': { origin: 'USA', cycle: '20–24 semaines', trait: 'Dinde traditionnelle rousse, chair savoureuse, rustique' },
  'Dinde Pondeuse': { origin: 'Sélection européenne / USA', cycle: '60 semaines de ponte', trait: 'Reproductrices / ponte de dinde, pic vers 36–40 semaines' },
  // CAILLE
  'Caille Japonaise': { origin: 'Japon', cycle: '7–8 semaines', trait: 'Caille de chair, petite mais précoce, maturation rapide' },
  'Caille Coturnix': { origin: 'Eurasie / domestiquée', cycle: '7–8 semaines', trait: 'Caille robuste, bonne ponte et bonne chair (double objet)' },
  'Caille Pondeuse': { origin: 'Afrique / Europe', cycle: '30–40 semaines de ponte', trait: 'Ponte intensive (80%+), œufs adaptés à la consommation' },
  // CANARD
  'Canard de Barbarie': { origin: 'Amérique du Sud / France', cycle: '11–12 semaines', trait: 'Canard de chair musqué, poids élevé, faible gras, très prisé' },
  'Canard de Pékin': { origin: 'Chine / Europe', cycle: '8–10 semaines', trait: 'Croissance très rapide, excellent rendement chair, chair tendre' },
  'Canard Coureur Indien': { origin: 'Inde / Europe', cycle: '60 semaines de ponte', trait: 'Ponteuse prolifique (200 œufs/an), posture dressée, très résistant' },
  'Canard de Barbarie (pondeuse)': { origin: 'Amérique du Sud / France', cycle: '50 semaines de ponte', trait: 'Ponte modérée mais régulière, œufs riches et recherchés' },
  // OIE
  'Oie de Toulouse': { origin: 'France', cycle: '20 semaines', trait: 'Grosse oie à foie, chair abondante, prudente et rustique' },
  'Oie de Chine': { origin: 'Asie', cycle: '18 semaines', trait: 'Oie moyenne vive, polymorphe, bonne valorisation de l\'herbe' },
  'Oie de Chine (pondeuse)': { origin: 'Asie', cycle: 'saison de ponte', trait: 'Ponte saisonnière (60–80 œufs), fiable sous climat chaud' },
  // FAISAN
  'Faisan de Colchide': { origin: 'Europe / Asie', cycle: '20 semaines', trait: 'Gibier de chair, viande fine, élevage semi-extensif' },
  'Faisan Doré': { origin: 'Chine', cycle: '20 semaines', trait: 'Faisan ornemental et de chair, poids modéré, plumage éclatant' },
  'Faisan de Colchide (pondeuse)': { origin: 'Europe / Asie', cycle: '30 ± 40 semaines de ponte', trait: 'Ponte saisonnière (~40 œufs), idéale pour volière de reproduction' },
  // AUTRE (volailles locales / non catégorisées)
  'Volaille Locale (chair)': { origin: 'Locale (Gabon)', cycle: '16–24 semaines', trait: 'Poule locale rustique, croissance lente, viande ferme et prisée' },
  'Volaille Locale (pondeuse)': { origin: 'Locale (Gabon)', cycle: '60 semaines de ponte', trait: 'Poule locale pondeuse, ponte modérée mais robuste, couveuse naturelle' },
};

const CARE_TYPE_LABEL: Record<string, string> = {
  VACCIN: 'Vaccin',
  MEDICAMENT: 'Médicament',
  VITAMINE: 'Vitamine',
  ANTIBIOTIQUE: 'Antibiotique',
  AUTRE: 'Autre',
};

const SPECIES_LIST: { key: Species; label: string; icon: string }[] = [
  { key: 'POULET', label: 'Poulet', icon: '🐔' },
  { key: 'PINTADE', label: 'Pintade', icon: '🐦' },
  { key: 'DINDE', label: 'Dinde', icon: '🦃' },
  { key: 'CAILLE', label: 'Caille', icon: '🐤' },
  { key: 'CANARD', label: 'Canard', icon: '🦆' },
  { key: 'OIE', label: 'Oie', icon: '🦢' },
  { key: 'FAISAN', label: 'Faisan', icon: '🦚' },
  { key: 'AUTRE', label: 'Autre', icon: '🐓' },
];

const SPECIES_LABEL: Record<Species, string> = {
  POULET: 'Poulet',
  PINTADE: 'Pintade',
  DINDE: 'Dinde',
  CAILLE: 'Caille',
  CANARD: 'Canard',
  OIE: 'Oie',
  FAISAN: 'Faisan',
  AUTRE: 'Autre (volailles)',
};

/** Densité maximale conseillée (haut de la bande recommandée) en oiseaux/m². */
const DENSITY_MAX_PER_M2: Record<BatchType, number> = { CHAIR: 15, PONDEUSE: 8 };

interface BuildingSpace {
  occupied: number;
  capacityAvailable: number | null;
  densityAvailable: number | null;
  available: number | null;
}

function buildingSpace(b: Building, type: BatchType): BuildingSpace {
  const occupied = b.stats?.activeBirds ?? 0;
  const capacityAvailable = b.capacity != null ? Math.max(0, b.capacity - occupied) : null;
  const densityAvailable =
    b.buildingAreaM2 != null && b.buildingAreaM2 > 0
      ? Math.max(0, Math.floor(b.buildingAreaM2 * DENSITY_MAX_PER_M2[type]) - occupied)
      : null;
  const available =
    capacityAvailable != null && densityAvailable != null
      ? Math.min(capacityAvailable, densityAvailable)
      : (capacityAvailable ?? densityAvailable);
  return { occupied, capacityAvailable, densityAvailable, available };
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / 86_400_000);
}

interface CreateLotSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function CreateLotSheet({ visible, onClose }: CreateLotSheetProps) {
  const { farmId } = useAuth();
  const qc = useQueryClient();

  // Required fields
  const [batchName, setBatchName] = useState('');
  const [integrationDate, setIntegrationDate] = useState(new Date());
  const [quantityAtStart, setQuantityAtStart] = useState('');
  const [type, setType] = useState<BatchType>('CHAIR');
  const [species, setSpecies] = useState<Species>('POULET');
  const [selectedBreedId, setSelectedBreedId] = useState<string | null>(null);
  const [customSpecies, setCustomSpecies] = useState('');
  const [customBreed, setCustomBreed] = useState('');

  // Running lot mode
  const [isRunning, setIsRunning] = useState(false);
  const [quantityAlive, setQuantityAlive] = useState('');
  const [feedPhase, setFeedPhase] = useState<FeedPhase | ''>('');
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const [showFeedPhasePicker, setShowFeedPhasePicker] = useState(false);

  // Optional HACCP fields
  const [couvoirSupplier, setCouvoirSupplier] = useState('');
  const [chickLotNumber, setChickLotNumber] = useState('');
  const [hatchDate, setHatchDate] = useState<Date | null>(null);
  const [chickUnitPrice, setChickUnitPrice] = useState('');

  // Pickers
  const [showIntegrationPicker, setShowIntegrationPicker] = useState(false);
  const [showHatchPicker, setShowHatchPicker] = useState(false);
  const [showBreedPicker, setShowBreedPicker] = useState(false);
  const [showBuildingPicker, setShowBuildingPicker] = useState(false);

  // Species carousel scroll state (chevron navigation)
  const speciesScrollRef = useRef<ScrollView>(null);
  const [speciesScrollX, setSpeciesScrollX] = useState(0);
  const [speciesViewW, setSpeciesViewW] = useState(0);
  const [speciesContentW, setSpeciesContentW] = useState(0);
  const SPECIES_STEP = 126; // card width 116 + gap 10
  const SPECIES_PAD_H = 2; // matches speciesCarouselContent paddingHorizontal
  const maxSpeciesScrollX = Math.max(0, speciesContentW - speciesViewW);
  const atSpeciesEnd = speciesScrollX >= maxSpeciesScrollX - 2;
  const activeSpeciesIndex = atSpeciesEnd
    ? SPECIES_LIST.length - 1
    : Math.min(
        Math.max(Math.round((speciesScrollX + SPECIES_PAD_H) / SPECIES_STEP), 0),
        SPECIES_LIST.length - 1,
      );
  const goToSpecies = (i: number) => {
    speciesScrollRef.current?.scrollTo({
      x: Math.max(0, Math.min(SPECIES_PAD_H + i * SPECIES_STEP, maxSpeciesScrollX)),
      animated: true,
    });
  };

  // Queries
  const buildingsQuery = useQuery({ queryKey: ['buildings', farmId], queryFn: () => fetchBuildings(farmId) });
  // La liste des souches peut évoluer côté serveur (seed, nouvelles souches) :
  // on la rafraîchit à chaque ouverture de la feuille, même si le cache a
  // moins de 30 s.
  const breedsQuery = useQuery({ queryKey: ['breeds'], queryFn: fetchBreeds });
  useEffect(() => {
    if (visible) void qc.invalidateQueries({ queryKey: ['breeds'] });
  }, [qc, visible]);
  const standardsQuery = useQuery({
    queryKey: ['breed-standards', selectedBreedId],
    queryFn: () => fetchBreedStandards(selectedBreedId!),
    enabled: !!selectedBreedId,
  });

  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);

  // Auto-calculate age in days for running lots
  const currentAgeDays = useMemo(() => {
    const ms = Date.now() - integrationDate.getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  }, [integrationDate]);

  // ── Feed phase options ──
  const CHAIR_FEED_PHASES: { key: FeedPhase; label: string; dayFrom: number; dayTo: number }[] = [
    { key: 'POUSSIN', label: '🌾 Poussin (0–10 j)', dayFrom: 0, dayTo: 10 },
    { key: 'DEMARRAGE', label: '🌾 Démarrage (11–24 j)', dayFrom: 11, dayTo: 24 },
    { key: 'CROISSANCE', label: '🌾 Croissance (25–35 j)', dayFrom: 25, dayTo: 35 },
    { key: 'FINITION', label: '🌾 Finition (36+ j)', dayFrom: 36, dayTo: 999 },
  ];
  const PONDEUSE_FEED_PHASES: { key: FeedPhase; label: string; dayFrom: number; dayTo: number }[] = [
    { key: 'POUSSIN', label: '🌾 Poussin (0–10 j)', dayFrom: 0, dayTo: 10 },
    { key: 'DEMARRAGE', label: '🌾 Démarrage (11–24 j)', dayFrom: 11, dayTo: 24 },
    { key: 'CROISSANCE', label: '🌾 Croissance (25–112 j)', dayFrom: 25, dayTo: 112 },
    { key: 'PRE_PONTE', label: '🌾 Pré-ponte (113–126 j)', dayFrom: 113, dayTo: 126 },
    { key: 'PONTE_PHASE_1', label: '🌾 Ponte 1 (127+ j)', dayFrom: 127, dayTo: 999 },
  ];
  const feedPhaseOptions = type === 'CHAIR' ? CHAIR_FEED_PHASES : PONDEUSE_FEED_PHASES;

  // Suggest feed phase from age
  const suggestedFeedPhase = useMemo(() => {
    if (!isRunning) return '' as FeedPhase | '';
    const age = currentAgeDays;
    const opt = feedPhaseOptions.find((p) => age >= p.dayFrom && age <= p.dayTo);
    return (opt?.key ?? 'POUSSIN') as FeedPhase;
  }, [isRunning, currentAgeDays, feedPhaseOptions]);

  // ── Protocol queries (for running lot treatment checklist) ──
  const protocolsQuery = useQuery({
    queryKey: ['sanitary-protocols', species, type],
    queryFn: () => fetchProtocols(species, type),
  });
  const defaultProtocol = useMemo(() => {
    const protocols = protocolsQuery.data ?? [];
    return (
      protocols.find((p) => p.species === species && p.type === type && p.isDefault) ??
      protocols.find((p) => p.species === species && p.type === type) ??
      protocols.find((p) => p.type === type && p.isDefault) ??
      protocols.find((p) => p.type === type) ??
      null
    );
  }, [protocolsQuery.data, type, species]);
  const protocolStepsQuery = useQuery({
    queryKey: ['sanitary-program', defaultProtocol?.id],
    queryFn: () => fetchSanitaryProgram(defaultProtocol!.id),
    enabled: !!defaultProtocol && isRunning,
  });

  // Protocol steps due by current age
  const dueSteps = useMemo(() => {
    const steps = protocolStepsQuery.data?.steps ?? [];
    return steps.filter((s) => s.active && s.dayFrom <= currentAgeDays).sort((a, b) => a.dayFrom - b.dayFrom);
  }, [protocolStepsQuery.data, currentAgeDays]);
  const upcomingSteps = useMemo(() => {
    const steps = protocolStepsQuery.data?.steps ?? [];
    return steps.filter((s) => s.active && s.dayFrom > currentAgeDays).sort((a, b) => a.dayFrom - b.dayFrom);
  }, [protocolStepsQuery.data, currentAgeDays]);

  // Toggle a step in the completed set
  const toggleStep = useCallback((id: string) => {
    setCompletedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Keep completed set aligned with the protocol steps actually due at the current age
  const dueStepIds = useMemo(() => new Set(dueSteps.map((s) => s.id)), [dueSteps]);
  useEffect(() => {
    setCompletedStepIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (dueStepIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [dueStepIds]);

  // Auto-apply the age-recommended feed phase when none is set yet
  useEffect(() => {
    if (isRunning && !feedPhase && suggestedFeedPhase) setFeedPhase(suggestedFeedPhase);
  }, [isRunning, feedPhase, suggestedFeedPhase]);

  // Drop a feed phase that no longer exists for the current type (Chair vs Pondeuse)
  const feedPhaseKeys = useMemo(() => new Set(feedPhaseOptions.map((p) => p.key)), [feedPhaseOptions]);
  useEffect(() => {
    if (feedPhase && !feedPhaseKeys.has(feedPhase)) setFeedPhase('');
  }, [feedPhaseKeys, feedPhase]);

  // Filter breeds by type + species
  const filteredBreeds = useMemo(() => {
    return (breedsQuery.data ?? []).filter((b) => b.type === type && b.species === species);
  }, [breedsQuery.data, type, species]);

  // Selected breed info
  const selectedBreed = useMemo(() => {
    return (breedsQuery.data ?? []).find((b) => b.id === selectedBreedId) ?? null;
  }, [breedsQuery.data, selectedBreedId]);

  // Building availability (capacity + density remaining) filtered by selected type
  const buildingSpaces = useMemo(() => {
    return new Map<string, BuildingSpace>(
      (buildingsQuery.data ?? []).map((b) => [b.id, buildingSpace(b, type)]),
    );
  }, [buildingsQuery.data, type]);

  const buildingOptions = useMemo(() => {
    return (buildingsQuery.data ?? []).map((b) => {
      const space = buildingSpaces.get(b.id) ?? buildingSpace(b, type);
      const disabled = space.available != null && space.available <= 0;
      const hints: string[] = [];
      if (b.buildingAreaM2 != null) hints.push(`${b.buildingAreaM2} m²`);
      if (space.available != null) hints.push(`${space.available} places restantes (conseillé)`);
      if (space.occupied > 0) hints.push(`${space.occupied} oiseaux présents`);
      if (disabled) hints.push('Complet');
      return {
        id: b.id,
        label: b.name,
        hint: hints.join(' · '),
        disabled,
        space,
      } as const;
    });
  }, [buildingsQuery.data, buildingSpaces, type]);

  const selectedBuilding = useMemo(() => {
    return (buildingsQuery.data ?? []).find((b) => b.id === selectedBuildingId) ?? null;
  }, [buildingsQuery.data, selectedBuildingId]);

  const selectedBuildingFull = useMemo(() => {
    if (!selectedBuildingId) return false;
    const opt = buildingOptions.find((o) => o.id === selectedBuildingId);
    return opt?.disabled ?? true;
  }, [buildingOptions, selectedBuildingId]);

  // Smart advisory calculations
  const advisory = useMemo(() => {
    const raw = standardsQuery.data;
    const standards = Array.isArray(raw) ? raw : [];
    if (standards.length === 0) return null;

    const qty = parseInt(quantityAtStart, 10) || 0;
    const lastStandard = standards[standards.length - 1];

    if (type === 'CHAIR') {
      // Chair: find slaughter-ready week. Pour le poulet standard on vise
      // ~2 kg ; pour les espèces plus légères (pintade, caille, locale) on
      // prend 90 % du poids final de la courbe.
      const finalWeek = standards[standards.length - 1];
      const finalWeight = finalWeek?.targetAvgWeightKg ?? 0;
      const finalFcr = finalWeek?.targetFcr ?? 0;

      const slaughterThreshold =
        finalWeight >= 2.0 ? 2.0 : 0.9 * finalWeight;
      const slaughterWeek =
        standards.find((s) => (s.targetAvgWeightKg ?? 0) >= slaughterThreshold)?.week ??
        finalWeek?.week ??
        6;

      const slaughterDate = addWeeks(integrationDate, slaughterWeek);
      const finalDate = addWeeks(integrationDate, finalWeek?.week ?? 12);

      // Density check (10 birds/m² for Chair)
      const totalKg = qty * finalWeight;
      const estimatedArea = qty / 10; // 10 birds/m² standard

      return {
        cycleWeeks: finalWeek?.week ?? 12,
        slaughterReadyDate: slaughterDate,
        slaughterReadyWeek: slaughterWeek,
        finalDate,
        finalWeightKg: finalWeight,
        finalFcr,
        estimatedTotalKg: totalKg,
        estimatedAreaM2: estimatedArea,
        revenue: {
          totalKg,
          pricePerKg: 2500, // FCFA/kg typical
          totalRevenue: totalKg * 2500,
          pricePerPiece: 5000, // FCFA/tête typical (vente à la pièce)
          totalRevenuePerPiece: qty * 5000,
        },
        lifecycle: [
          { week: 0, label: 'Poussins', desc: 'Démarrage, chaleur, eau + vitamines', date: addWeeks(integrationDate, 0) },
          { week: slaughterWeek, label: 'Prêt à vendre', desc: `${finalWeight.toFixed(1)} kg, IC ${finalFcr.toFixed(2)}`, date: addWeeks(integrationDate, slaughterWeek) },
          { week: finalWeek?.week ?? 12, label: 'Fin de cycle', desc: 'Abattage ou vendre vivante', date: addWeeks(integrationDate, finalWeek?.week ?? 12) },
        ],
      };
    } else {
      // Pondeuse: find peak week and end of cycle
      const peakWeek = standards.reduce((best, s) =>
        (s.targetLayRatePercent ?? 0) > (best.targetLayRatePercent ?? 0) ? s : best,
      );
      const startLaying = standards.find((s) => (s.targetLayRatePercent ?? 0) >= 10);
      const endCycle = standards.find((s) => (s.targetLayRatePercent ?? 0) < 60);

      const peakDate = addWeeks(integrationDate, peakWeek.week);
      const startLayingDate = addWeeks(integrationDate, startLaying?.week ?? 18);
      const endCycleDate = endCycle ? addWeeks(integrationDate, endCycle.week) : null;

      // Density check (6 birds/m² for Pondeuse)
      const estimatedArea = qty / 6;

      // Egg production estimate (peak weeks × daily production)
      const peakRate = (peakWeek.targetLayRatePercent ?? 85) / 100;
      const dailyEggsAtPeak = Math.round(qty * peakRate);
      const monthlyEggs = dailyEggsAtPeak * 30;

      // Alvéoles (plateaux de 30 œufs) + revenu ponte estimé
      const eggsPerAlveole = 30;
      const eggPriceFcfa = 100; // FCFA/œuf typical (~3 000 FCFA/alvéole)
      const eggPriceAlveoleFcfa = eggPriceFcfa * eggsPerAlveole;
      const dailyAlveolesAtPeak = Math.round(dailyEggsAtPeak / eggsPerAlveole);
      const monthlyAlveoles = Math.round(monthlyEggs / eggsPerAlveole);
      const monthlyRevenueFcfa = Math.round(monthlyEggs * eggPriceFcfa);

      return {
        cycleWeeks: lastStandard?.week ?? 72,
        peakWeek: peakWeek.week,
        peakDate,
        peakRate: peakWeek.targetLayRatePercent ?? 0,
        startLayingDate,
        startLayingWeek: startLaying?.week ?? 18,
        endCycleDate,
        endCycleWeek: endCycle?.week ?? 72,
        dailyEggsAtPeak,
        monthlyEggs,
        eggsPerAlveole,
        eggPriceFcfa,
        eggPriceAlveoleFcfa,
        dailyAlveolesAtPeak,
        monthlyAlveoles,
        monthlyRevenueFcfa,
        estimatedAreaM2: estimatedArea,
        lifecycle: [
          { week: 0, label: 'Poussins', desc: 'Démarrage, croissance', date: addWeeks(integrationDate, 0) },
          { week: startLaying?.week ?? 18, label: 'Début ponte', desc: 'Premiers œufs, montée en cadence', date: addWeeks(integrationDate, startLaying?.week ?? 18) },
          { week: peakWeek.week, label: 'Pic de production', desc: `${peakWeek.targetLayRatePercent}% ponte`, date: addWeeks(integrationDate, peakWeek.week) },
          { week: endCycle?.week ?? 72, label: 'Fin de ponte', desc: 'Transition → vente vivante ou abattage chair', date: addWeeks(integrationDate, endCycle?.week ?? 72) },
        ],
      };
    }
  }, [standardsQuery.data, type, quantityAtStart, integrationDate]);

  const createMutation = useMutation({
    mutationFn: async (input: BatchInput) => {
      const result = await createBatch(farmId, input);
      // For running lots, create treatment records for completed steps
      if (isRunning && completedStepIds.size > 0 && result?.id) {
        const batchId = result.id;
        const selectedSteps = dueSteps.filter((s) => completedStepIds.has(s.id));
        await Promise.all(
          selectedSteps.map((step) =>
            createTreatment(farmId, batchId, {
              careType: step.careType,
              productName: step.name,
              dosage: step.dosage ?? undefined,
              route: step.route ?? undefined,
              administeredAt: addDaysToDate(integrationDate, step.dayFrom).toISOString().slice(0, 10),
              withdrawalDays: step.withdrawalDays || undefined,
              notes: `Renseigné lors de l'ajout du lot en cours (âge ${formatAge(currentAgeDays) || '0 j'})`,
            })
          )
        );
      }
      return result;
    },
    onSuccess: () => {
      invalidateFarmQueries(qc, { farmId });
      resetForm();
      onClose();
    },
  });

  const resetForm = () => {
    setBatchName('');
    setIntegrationDate(new Date());
    setQuantityAtStart('');
    setType('CHAIR');
    setSpecies('POULET');
    setSelectedBreedId(null);
    setCustomSpecies('');
    setCustomBreed('');
    setSelectedBuildingId(null);
    setCouvoirSupplier('');
    setChickLotNumber('');
    setHatchDate(null);
    setChickUnitPrice('');
    setIsRunning(false);
    setQuantityAlive('');
    setFeedPhase('');
    setCompletedStepIds(new Set());
  };

  const isAutre = species === 'AUTRE';
  const typeAccent = type === 'CHAIR' ? palette.accent[500] : palette.brand[600];
  const canSubmit =
    batchName.trim().length > 0 &&
    quantityAtStart.trim().length > 0 &&
    parseInt(quantityAtStart, 10) > 0 &&
    (isAutre
      ? customSpecies.trim().length > 0 && customBreed.trim().length > 0
      : selectedBreedId != null) &&
    selectedBuildingId != null &&
    !selectedBuildingFull &&
    (!isRunning || (quantityAlive.trim().length > 0 && parseInt(quantityAlive, 10) >= 0));

  const onSubmit = () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const payload: BatchInput = {
      batchName: batchName.trim(),
      integrationDate: integrationDate.toISOString().slice(0, 10),
      quantityAtStart: parseInt(quantityAtStart, 10),
      type,
      species,
    };
    if (isRunning && quantityAlive.trim()) {
      payload.quantityAlive = parseInt(quantityAlive, 10);
    }
    if (isAutre) {
      payload.customSpecies = customSpecies.trim();
      payload.customBreed = customBreed.trim();
    } else if (selectedBreedId) {
      payload.breedId = selectedBreedId;
    }
    if (selectedBuildingId) payload.buildingId = selectedBuildingId;
    if (couvoirSupplier.trim()) payload.couvoirSupplier = couvoirSupplier.trim();
    if (chickLotNumber.trim()) payload.chickLotNumber = chickLotNumber.trim();
    if (hatchDate) payload.hatchDate = hatchDate.toISOString().slice(0, 10);
    if (chickUnitPrice.trim()) payload.chickUnitPriceFcfa = parseInt(chickUnitPrice, 10);
    createMutation.mutate(payload);
  };

  const onIntegrationDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowIntegrationPicker(false);
    if (date) setIntegrationDate(date);
  };

  const onHatchDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowHatchPicker(false);
    if (date) setHatchDate(date);
  };

  const onSelectSpecies = (key: Species) => {
    Haptics.selectionAsync().catch(() => {});
    setSpecies(key);
    setSelectedBreedId(null);
    if (key !== 'AUTRE' && species === 'AUTRE') {
      setCustomSpecies('');
      setCustomBreed('');
    }
  };

  const fmtDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Sheet
      visible={visible}
      title={isRunning ? 'Ajouter un lot en cours' : 'Créer un lot'}
      subtitle={isRunning ? "Renseigner l'état actuel du lot" : "Nouveau lot — suivi zootechnique"}
      accentColor={typeAccent}
      onClose={onClose}>

      {/* ── Mode toggle: Nouveau vs En cours ── */}
      <View style={styles.modeRow}>
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setIsRunning(false); setQuantityAlive(''); }}
          style={[styles.modeBtn, !isRunning && styles.modeBtnActive]}
          accessibilityRole='button'>
          <AppText size='small' weight={!isRunning ? 'bold' : 'medium'} color={!isRunning ? 'surface' : 'muted'}>
            🐣 Nouveau lot
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setIsRunning(true); }}
          style={[styles.modeBtn, isRunning && styles.modeBtnActiveRun]}
          accessibilityRole='button'>
          <AppText size='small' weight={isRunning ? 'bold' : 'medium'} color={isRunning ? 'surface' : 'muted'}>
            🐤 Lot en cours
          </AppText>
        </Pressable>
      </View>

      {isRunning && (
        <View style={styles.runningBanner}>
          <Zap size={14} color={palette.amber[600]} />
          <AppText size='small' color='text' style={{ flex: 1 }} numberOfLines={1}>
            Âge calculé depuis la mise en place.
          </AppText>
        </View>
      )}

      <SectionTitle label='Informations du lot' />

{/* ── Espèce ── */}
      <Field label='Espèce Gallinacé *'>
        <ScrollView
          ref={speciesScrollRef}
          horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.speciesCarouselContent}
            snapToInterval={SPECIES_STEP}
            decelerationRate='fast'
            onScroll={(e) => setSpeciesScrollX(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
            onLayout={(e) => setSpeciesViewW(e.nativeEvent.layout.width)}
            onContentSizeChange={(w) => setSpeciesContentW(w)}>
            {SPECIES_LIST.map((s) => {
              const selected = species === s.key;
              const img = SPECIES_IMAGES[s.key];
              return (
                <Pressable
                  key={s.key}
                  onPress={() => onSelectSpecies(s.key)}
                  accessibilityRole='button'
                  accessibilityLabel={s.label}
                  style={[styles.speciesCard, selected && { borderColor: typeAccent }]}>
                  {img ? (
                    <Image
                      source={img}
                      style={[
                        styles.speciesCardImg,
                        s.key === 'PINTADE' && styles.speciesCardImgShiftLeft,
                        s.key === 'FAISAN' && styles.speciesCardImgShiftFaisan,
                      ]}
                      resizeMode='cover'
                    />
                  ) : (
                    <View style={styles.speciesCardPlaceholder}>
                      <AppText size='h2' style={{ lineHeight: 34 }}>{s.icon}</AppText>
                    </View>
                  )}
                  <View style={[styles.speciesCardLabel, selected && { backgroundColor: typeAccent }]}>
                    <AppText size='label' weight='bold' color='surface'>{s.label}</AppText>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        {maxSpeciesScrollX > 0 && (
          <View style={styles.speciesDots} pointerEvents='box-none'>
            {SPECIES_LIST.map((s, i) => {
              const active = i === activeSpeciesIndex;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); goToSpecies(i); }}
                  hitSlop={4}
                  accessibilityRole='button'
                  accessibilityLabel={`Voir les espèces ${s.label}`}
                  style={[styles.speciesDot, active && styles.speciesDotActive, active && { backgroundColor: typeAccent }]}
                />
              );
            })}
          </View>
        )}
        <AppText size='small' color='faint'>
          {species === 'AUTRE'
            ? 'Indiquez librement la volaille et sa souche.'
            : "Les souches disponibles s'adaptent à l'espèce choisie."}
        </AppText>
      </Field>

      {/* ── Type ── */}
      <Field label='Type *'>
        <View style={styles.typeRow}>
          {(['CHAIR', 'PONDEUSE'] as BatchType[]).map((t) => (
            <Pressable key={t} onPress={() => { Haptics.selectionAsync().catch(() => {}); setType(t); setSelectedBreedId(null); }}
              style={[styles.typeBtn, type === t && { backgroundColor: typeAccent, borderColor: type === 'CHAIR' ? palette.accent[600] : palette.brand[700] }]}>
              <AppText size='small'>{t === 'CHAIR' ? '🍗' : '🥚'}</AppText>
              <AppText size='small' weight={type === t ? 'bold' : 'medium'} color={type === t ? 'surface' : 'muted'}>
                {t === 'CHAIR' ? 'Chair' : 'Pondeuse'}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Field>

      {/* ── Souche / Breed ── */}
      <Field label='Souche *'>
{species === 'AUTRE' ? (
          <>
            <AppText size='small' weight='bold' color='muted'>Espèce</AppText>
            <RNTextInput
              value={customSpecies}
              onChangeText={setCustomSpecies}
              placeholder={'Ex : Canard, Oie, Faisan, Autruche…'}
              placeholderTextColor={color.ink[300]}
              style={styles.customBreedInput}
            />
            <AppText size='small' weight='bold' color='muted' style={styles.customBreedInputGap}>Souche / Race</AppText>
            <RNTextInput
              value={customBreed}
              onChangeText={setCustomBreed}
              placeholder={'Ex : Coureur indien, Rouge…'}
              placeholderTextColor={color.ink[300]}
              style={styles.customBreedInput}
            />
          </>
        ) : (
          <>
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowBreedPicker(true); }} style={styles.selectBtn}>
              <View style={{ flex: 1 }}>
                {selectedBreed ? (
                  <>
                    <View style={styles.selectedBreedRow}>
                      <Image
                        source={BREED_IMAGES[selectedBreed.name] ?? SPECIES_IMAGES[species]}
                        style={styles.selectedBreedThumb}
                        resizeMode='contain'
                      />
                      <AppText size='body' weight='bold' color='text'>{selectedBreed.name}</AppText>
                      {selectedBreed.refCode ? (
                        <View style={styles.refCodeChip}>
                          <AppText size='caption' weight='bold' color='brand'>{selectedBreed.refCode}</AppText>
                        </View>
                      ) : null}
                    </View>
                    <AppText size='small' color='muted'>
                      {BREED_INFO[selectedBreed.name]?.origin ?? ''}{BREED_INFO[selectedBreed.name] ? ' · ' : ''}{BREED_INFO[selectedBreed.name]?.cycle ?? ''}
                    </AppText>
                  </>
                ) : (
                  <AppText size='body' color='faint'>Sélectionner une souche…</AppText>
                )}
              </View>
              <ChevronDown size={18} color={color.ink[400]} />
            </Pressable>
            {selectedBreed && BREED_INFO[selectedBreed.name] && (
              <View style={styles.breedInfo}>
                <AppText size='small' weight='bold' color='brand'>
                  {selectedBreed.name}{selectedBreed.refCode ? ` · ${selectedBreed.refCode}` : ''} — Origine {BREED_INFO[selectedBreed.name].origin} · Cycle {BREED_INFO[selectedBreed.name].cycle}
                </AppText>
                <AppText size='small' color='muted'>{BREED_INFO[selectedBreed.name].trait}</AppText>
              </View>
            )}
          </>
        )}
      </Field>

      {/* ── Nom du lot ── */}
      <Field label='Nom du lot *'>
        <TextInput value={batchName} onChangeText={setBatchName} placeholder='Ex : Lot B-049' />
      </Field>

      {/* ── Quantité poussins ── */}
      <Field label={isRunning ? "Quantité d'origine *" : "Quantité de poussins *"}>
        <TextInput value={quantityAtStart} onChangeText={setQuantityAtStart} placeholder='Ex : 3000' keyboardType='numeric' />
      </Field>

      {/* ── Running lot: current stock + age ── */}
      {isRunning && (
        <>
          <Field label='Effectif vivant actuel *'>
            <TextInput value={quantityAlive} onChangeText={setQuantityAlive} placeholder='Ex : 2850' keyboardType='numeric' />
          </Field>
          {quantityAtStart.trim() && quantityAlive.trim() && parseInt(quantityAtStart, 10) > 0 && (
            <View style={styles.runningInsight}>
              <AppText size='small' color='muted'>
                Mortalité : {Math.max(0, parseInt(quantityAtStart, 10) - parseInt(quantityAlive, 10))} oiseaux
                ({((1 - parseInt(quantityAlive, 10) / parseInt(quantityAtStart, 10)) * 100).toFixed(1)}%)
              </AppText>
            </View>
          )}
        </>
      )}

      {/* ── Date de mise en place / d'arrivée ── */}
      <Field label={isRunning ? 'Date de mise en place du lot (Âge du lot) *' : "Date d'arrivée des poussins *"}>
        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowIntegrationPicker(true); }} style={styles.dateBtn}>
          <AppText size='body' color='text'>{fmtDate(integrationDate)}</AppText>
          {isRunning ? (
            currentAgeDays > 0 ? (
              <View style={styles.dateAgeChip}>
                <Clock size={12} color={palette.brand[600]} />
                <AppText size='label' weight='bold' color='brand'>
                  {formatAge(currentAgeDays)}
                </AppText>
              </View>
            ) : (
              <AppText size='caption' color='faint'>— âge auto</AppText>
            )
          ) : (
            <ChevronDown size={18} color={color.ink[400]} />
          )}
        </Pressable>
        {isRunning && (
          <AppText size='small' color='faint' style={styles.fieldHint}>
            L’âge (semaines et jours) est calculé depuis cette date.
          </AppText>
        )}
        {showIntegrationPicker && (
          <DateTimePicker value={integrationDate} mode='date'
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onIntegrationDateChange} maximumDate={new Date()} locale='fr-FR' />
        )}
      </Field>

      {/* ── Running lot: Feed phase ── */}
      {isRunning && (
        <>
          <SectionTitle label='Alimentation' />
          <Field label="Phase d'alimentation actuelle">
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowFeedPhasePicker(true); }} style={styles.selectBtn}>
              <Wheat size={16} color={color.amber[600]} />
              <View style={{ flex: 1 }}>
                {feedPhase ? (
                  <AppText size='body' weight='bold' color='text'>
                    {feedPhaseOptions.find((p) => p.key === feedPhase)?.label ?? feedPhase}
                  </AppText>
                ) : (
                  <AppText size='body' color='faint'>Sélectionner la phase actuelle…</AppText>
                )}
              </View>
              <ChevronDown size={18} color={color.ink[400]} />
            </Pressable>
            {suggestedFeedPhase && !feedPhase && (
              <Pressable
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setFeedPhase(suggestedFeedPhase); }}
                style={styles.suggestBtn}>
                <Zap size={12} color={palette.amber[600]} />
                <AppText size='small' weight='semibold' color='amber'>
                  Suggéré : {feedPhaseOptions.find((p) => p.key === suggestedFeedPhase)?.label ?? suggestedFeedPhase}
                </AppText>
              </Pressable>
            )}
            {feedPhase && suggestedFeedPhase && feedPhase !== suggestedFeedPhase && (
              <View style={styles.feedMismatch}>
                <AlertTriangle size={13} color={palette.amber[600]} />
                <AppText size='small' color='muted' style={{ flex: 1 }}>
                  {`Selon l'âge du lot (${formatAge(currentAgeDays) || '0 j'}), la phase recommandée est « ${feedPhaseOptions.find((p) => p.key === suggestedFeedPhase)?.label.replace(/^🌾\s*/, '') ?? suggestedFeedPhase} ».`}
                </AppText>
                <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setFeedPhase(suggestedFeedPhase); }}>
                  <AppText size='small' weight='bold' color='brand'>Appliquer</AppText>
                </Pressable>
              </View>
            )}
          </Field>

          <PickerModal
            visible={showFeedPhasePicker}
            onClose={() => setShowFeedPhasePicker(false)}
            title="Phase d'alimentation actuelle"
            options={feedPhaseOptions.map((p) => ({
              id: p.key,
              label: p.label,
              hint: `${p.dayFrom}–${p.dayTo === 999 ? '∞' : p.dayTo} jours`,
            }))}
            selectedId={feedPhase || null}
            onSelect={(id) => setFeedPhase(id as FeedPhase)}
          />
        </>
      )}

      {/* ── Running lot: Treatment checklist ── */}
      {isRunning && dueSteps.length > 0 && (
        <>
          <SectionTitle label='Soins prophylactiques réalisés' />
          <View style={styles.treatmentInfo}>
            <ShieldCheck size={14} color={palette.brand[600]} />
            <AppText size='small' color='muted' style={{ flex: 1 }}>
              Cochez les soins déjà administrés à ce lot. Ils seront enregistrés à leur jour planifié (date de mise en place + jour du protocole).
            </AppText>
          </View>
          {dueSteps.map((step) => (
            <Pressable
              key={step.id}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); toggleStep(step.id); }}
              style={[styles.treatmentRow, completedStepIds.has(step.id) && styles.treatmentRowDone]}
              accessibilityRole='checkbox'
              accessibilityState={{ checked: completedStepIds.has(step.id) }}>
              <View style={[styles.checkbox, completedStepIds.has(step.id) && styles.checkboxOn]}>
                {completedStepIds.has(step.id) && <Check size={12} color={palette.surface} />}
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size='body' weight='semibold' color={completedStepIds.has(step.id) ? 'brand' : 'text'}>
                  {step.name}
                </AppText>
                <AppText size='small' color='muted'>
                  {CARE_TYPE_LABEL[step.careType] ?? step.careType}
                  {step.dosage ? ` · ${step.dosage}` : ''}
                  {step.route ? ` · ${step.route}` : ''}
                </AppText>
                <AppText size='small' color='faint'>
                  Jour {step.dayFrom}–{step.dayTo}
                  {step.withdrawalDays > 0 ? ` · délai d'attente ${step.withdrawalDays} j` : ''}
                </AppText>
              </View>
            </Pressable>
          ))}
          {completedStepIds.size > 0 && (
            <View style={styles.treatmentSummary}>
              <Check size={14} color={palette.green[600]} />
              <AppText size='small' weight='bold' color='success'>
                {completedStepIds.size} soin{completedStepIds.size > 1 ? 's' : ''} enregistré{completedStepIds.size > 1 ? 's' : ''}
              </AppText>
            </View>
          )}
        </>
      )}

      {/* ── Running lot: Age-based advisory ── */}
      {isRunning && (
        <View style={styles.ageAdvisoryCard}>
          <View style={styles.advisoryHeader}>
            <Eye size={14} color={palette.brand[600]} />
            <AppText size='body' weight='bold' color='brand'>Recommandations à {formatAge(currentAgeDays) || '0 j'}</AppText>
          </View>

          {/* Feed phase advice */}
          {(() => {
            const currentPhase = feedPhaseOptions.find((p) => currentAgeDays >= p.dayFrom && currentAgeDays <= p.dayTo);
            if (!currentPhase) return null;
            return (
              <View style={styles.advisoryItem}>
                <Wheat size={14} color={color.amber[600]} />
                <View style={{ flex: 1 }}>
                  <AppText size='small' weight='bold' color='text'>Alimentation recommandée</AppText>
                  <AppText size='small' color='muted'>
                    Phase {currentPhase.label} — surveillez la consommation journalière et ajustez la distribution selon l&apos;appétit du lot.
                  </AppText>
                </View>
              </View>
            );
          })()}

          {/* Upcoming treatments */}
          {upcomingSteps.length > 0 && (
            <View style={styles.advisoryItem}>
              <Syringe size={14} color={palette.brand[600]} />
              <View style={{ flex: 1 }}>
                <AppText size='small' weight='bold' color='text'>Prochains soins à planifier</AppText>
                {upcomingSteps.slice(0, 3).map((step) => (
                  <AppText key={step.id} size='small' color='muted'>
                    • Jour {step.dayFrom} : {step.name} ({CARE_TYPE_LABEL[step.careType] ?? step.careType})
                  </AppText>
                ))}
                {upcomingSteps.length > 3 && (
                  <AppText size='small' color='faint'>
                    + {upcomingSteps.length - 3} autre{upcomingSteps.length - 3 > 1 ? 's' : ''} soin{upcomingSteps.length - 3 > 1 ? 's' : ''}
                  </AppText>
                )}
              </View>
            </View>
          )}

          {/* Missing treatments warning */}
          {dueSteps.length > completedStepIds.size && (
            <View style={styles.advisoryItem}>
              <AlertTriangle size={14} color={palette.amber[600]} />
              <View style={{ flex: 1 }}>
                <AppText size='small' weight='bold' color='amber'>Soins non renseignés</AppText>
                <AppText size='small' color='muted'>
                  {dueSteps.length - completedStepIds.size} soin{dueSteps.length - completedStepIds.size > 1 ? 's' : ''} prévu{dueSteps.length - completedStepIds.size > 1 ? 's' : ''} par le protocole non cochés. Si ces soins n&apos;ont pas été réalisés, planifiez-les dès que possible.
                </AppText>
              </View>
            </View>
          )}

          {/* Best practices */}
          <View style={styles.advisoryItem}>
            <ShieldCheck size={14} color={palette.green[600]} />
            <View style={{ flex: 1 }}>
              <AppText size='small' weight='bold' color='text'>Bonnes pratiques</AppText>
              <AppText size='small' color='muted'>
                {type === 'CHAIR' ? (
                  currentAgeDays <= 10 ? '• Eau + vitamines à volonté\n• Chaleur maintenue (33–35°C)\n• Lumière 23h/j les 3 premiers jours' :
                  currentAgeDays <= 24 ? '• Surveiller la consommation\n• Vérifier la densité (max 15/m²)\n• Ajuster la température (24–26°C)' :
                  '• Préparer la vente : critères poids (≥2 kg)\n• Vérifier le_IC (≤2.0)\n• Identifier les retards de croissance'
                ) : (
                  currentAgeDays <= 10 ? '• Eau + vitamines à volonté\n• Chaleur maintenue (33–35°C)\n• Préparer les plateaux de ponte' :
                  currentAgeDays <= 24 ? '• Surveiller la consommation\n• Vérifier la densité (max 8/m²)\n• Planifier la transition alimentaire' :
                  currentAgeDays <= 126 ? '• Installer les nids à 16 semaines\n• Éclairage 16h/j pour stimuler la ponte\n• Augmenter progressivement la calcium' :
                  '• Vérifier le taux de ponte quotidien\n• Collecter les œufs 2–3×/jour\n• Surveiller la qualité des coquilles'
                )}
              </AppText>
            </View>
          </View>

          {protocolStepsQuery.isLoading && (
            <View style={{ padding: 8 }}>
              <AppText size='small' color='faint'>Chargement du protocole sanitaire…</AppText>
            </View>
          )}
        </View>
      )}

      <PickerModal
        visible={showBreedPicker}
        onClose={() => setShowBreedPicker(false)}
        title={`Souche — ${SPECIES_LABEL[species].toLowerCase()} ${type === 'CHAIR' ? 'de chair' : 'pondeuse'}`}
        options={filteredBreeds.map((b) => ({
          id: b.id,
          label: b.name,
          image: BREED_IMAGES[b.name] ?? SPECIES_IMAGES[species],
          hint: b.refCode
            ? `${b.refCode}${BREED_INFO[b.name] ? ` · ${BREED_INFO[b.name].origin} · ${BREED_INFO[b.name].cycle}` : ''}`
            : BREED_INFO[b.name]
              ? `${BREED_INFO[b.name].origin} · ${BREED_INFO[b.name].cycle}`
              : undefined,
        }))}
        selectedId={selectedBreedId}
        onSelect={(id) => setSelectedBreedId(id)}
      />

      {/* ── ADVISORY (below the souche list) ── */}
      {advisory && (
        <View style={styles.advisoryCard}>
          <View style={styles.advisoryHeader}>
            <TrendingUp size={14} color={palette.brand[600]} />
            <View style={{ flex: 1 }}>
              <AppText size='body' weight='bold' color='brand'>Analyse & Conseils</AppText>
            </View>
            <View style={styles.projectionBadge}>
              <AppText size='small' weight='bold' color='brand'>≈ probabilité</AppText>
            </View>
          </View>
          {selectedBreed && (
            <AppText size='small' color='muted'>Souche : {selectedBreed.name}</AppText>
          )}

          {type === 'CHAIR' ? (
            <View style={styles.advisoryGrid}>
              <AdvisoryTile icon={Clock} label='Cycle' value={`${advisory.cycleWeeks} semaines`} />
              <AdvisoryTile icon={Calendar} label='Vente prête' value={fmtDate(advisory.slaughterReadyDate!)} />
              <AdvisoryTile icon={TrendingUp} label='Poids final' value={`${(advisory.finalWeightKg ?? 0).toFixed(1)} kg`} />
              <AdvisoryTile icon={AlertTriangle} label='IC final' value={(advisory.finalFcr ?? 0).toFixed(2)} />
              <AdvisoryTile icon={TrendingUp} label='Résultat estimé' value={`${(advisory.estimatedTotalKg ?? 0).toFixed(0)} kg`} />
              <AdvisoryTile icon={TrendingUp} label='Revenu estimé' value={`≈ ${fmt(advisory.revenue?.totalRevenue ?? 0)} FCFA (à ${fmt(advisory.revenue?.pricePerKg ?? 2500)} FCFA/kg)`} />
              <AdvisoryTile icon={TrendingUp} label='Par pièce' value={`≈ ${fmt(advisory.revenue?.totalRevenuePerPiece ?? 0)} FCFA (à ${fmt(advisory.revenue?.pricePerPiece ?? 5000)} FCFA/tête)`} />
            </View>
          ) : (
            <View style={styles.advisoryGrid}>
              <AdvisoryTile icon={Clock} label='Cycle total' value={`${advisory.cycleWeeks} semaines`} />
              <AdvisoryTile icon={Calendar} label='Début ponte' value={fmtDate(advisory.startLayingDate!)} />
              <AdvisoryTile icon={TrendingUp} label='Pic production' value={`${(advisory.peakRate ?? 0).toFixed(0)}%`} />
              <AdvisoryTile icon={Calendar} label='Pic atteint' value={fmtDate(advisory.peakDate!)} />
              <AdvisoryTile icon={TrendingUp} label='Œufs/jour (pic)' value={String(advisory.dailyEggsAtPeak ?? 0)} />
              <AdvisoryTile icon={TrendingUp} label='Œufs/mois (pic)' value={`${fmt(advisory.monthlyEggs ?? 0)} unités`} />
              <AdvisoryTile icon={TrendingUp} label='Alvéoles/jour (pic)' value={`≈ ${fmt(advisory.dailyAlveolesAtPeak ?? 0)}`} />
              <AdvisoryTile icon={TrendingUp} label='Alvéoles/mois (pic)' value={`≈ ${fmt(advisory.monthlyAlveoles ?? 0)} (30 œufs)`} />
              <AdvisoryTile icon={TrendingUp} label='Revenu ponte/mois' value={`≈ ${fmt(advisory.monthlyRevenueFcfa ?? 0)} FCFA (à ${fmt(advisory.eggPriceAlveoleFcfa ?? 3000)} FCFA/alvéole)`} />
            </View>
          )}

          {/* Lifecycle timeline */}
          <View style={styles.timeline}>
            <AppText size='small' weight='semibold' color='muted'>Chronologie du lot</AppText>
            {advisory.lifecycle.map((step, i) => (
              <View key={i} style={styles.timelineStep}>
                <View style={[styles.timelineDot, i === 0 ? styles.timelineDotStart : i === advisory.lifecycle.length - 1 ? styles.timelineDotEnd : styles.timelineDotMid]} />
                <View style={{ flex: 1 }}>
                  <AppText size='small' weight='bold' color='text'>
                    {fmtDate(step.date)} — {step.label}
                  </AppText>
                  <AppText size='small' color='faint'>{step.desc}</AppText>
                </View>
                {i < advisory.lifecycle.length - 1 && <ArrowRight size={12} color={color.ink[300]} />}
              </View>
            ))}
          </View>

          {/* Pondeuse: transition advisory */}
          {type === 'PONDEUSE' && (
            <View style={styles.lifecycleNote}>
              <AppText size='small' weight='semibold' color={palette.brand[600]}>
                💡 Conseil fin de cycle
              </AppText>
              <AppText size='small' color='muted'>
                Après {advisory.endCycleWeek ?? 72} semaines de ponte, les pondeuses peuvent être :
              </AppText>
              <AppText size='small' color='text'>
                • Vendues vivantes (chair) — prix/kg en fin de production{'\n'}
                • Abattues pour commercialisation en viande{'\n'}
                • Gardées pour reproduction (si souche adaptée)
              </AppText>
            </View>
          )}

          <View style={styles.projectionNote}>
            <AppText size='small' color='faint'>
              ℹ️ Probabilité : projections calculées à partir des standards de la souche{selectedBreed ? ` (${selectedBreed.name})` : ''} — à titre indicatif, pas une garantie des résultats réels.
            </AppText>
          </View>
        </View>
      )}

      <SectionTitle label='Mise en place' />

      {/* ── Bâtiment (obligatoire) ── */}
      <Field label='Bâtiment *'>
        <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowBuildingPicker(true); }} style={styles.selectBtn}>
          <View style={{ flex: 1 }}>
            {selectedBuilding ? (
              <>
                <AppText size='body' weight='bold' color='text'>{selectedBuilding.name}</AppText>
                <AppText size='small' color='muted'>
                  {(() => {
                    const space = buildingSpaces.get(selectedBuilding.id);
                    const parts: string[] = [];
                    if (selectedBuilding.buildingAreaM2 != null) parts.push(`${selectedBuilding.buildingAreaM2} m²`);
                    if (space && space.available != null) parts.push(`${space.available} places restantes (conseillé)`);
                    if (space && space.occupied > 0) parts.push(`${space.occupied} oiseaux présents`);
                    return parts.length > 0 ? parts.join(' · ') : 'Capacité non définie';
                  })()}
                </AppText>
              </>
            ) : (
              <AppText size='body' color='faint'>Sélectionner un bâtiment…</AppText>
            )}
          </View>
          <ChevronDown size={18} color={color.ink[400]} />
        </Pressable>

        {selectedBuilding && (
          <View style={styles.buildingInsight}>
            <View style={styles.buildingInsightHeader}>
              <Warehouse size={14} color={palette.brand[600]} />
              <AppText size='body' weight='bold' color='brand'>Espace dans {selectedBuilding.name}</AppText>
            </View>

            <InsightRow label='Superficie'
              value={selectedBuilding.buildingAreaM2 != null ? `${selectedBuilding.buildingAreaM2} m²` : 'Non renseignée'} />

            <InsightRow label='Oiseaux présents'
              value={(() => {
                const space = buildingSpaces.get(selectedBuilding.id);
                if (!space) return '—';
                return space.capacityAvailable != null
                  ? `${space.occupied} / ${selectedBuilding.capacity} capacité`
                  : `${space.occupied} en cours`;
              })()} />

            <InsightRow label='Places restantes (conseillé)'
              value={(() => {
                const space = buildingSpaces.get(selectedBuilding.id);
                if (!space || space.available == null) return 'Capacité non définie';
                return `${space.available} oiseaux`;
              })()} />

            <InsightRow label='Densité conseillée'
              value={(() => {
                const density = selectedBuilding.stats?.densityPerM2;
                const label = type === 'CHAIR' ? '12–15 oiseaux/m²' : '6–8 oiseaux/m²';
                return density != null ? `${density.toFixed(1)} actuels · ${label}` : label;
              })()} />

            {(() => {
              const qty = parseInt(quantityAtStart, 10) || 0;
              const space = buildingSpaces.get(selectedBuilding.id);
              if (qty > 0 && space && space.available != null && qty > space.available) {
                return (
                  <View style={styles.insightWarn}>
                    <AlertTriangle size={13} color={palette.red[600]} />
                    <AppText size='small' color='danger'>
                      Quantité trop élevée : il manque {fmt(qty - space.available)} places sur ce bâtiment.
                    </AppText>
                  </View>
                );
              }
              return null;
            })()}

            {(() => {
              const vsDays = daysSince(selectedBuilding.lastVideSanitaireAt ?? null);
              if (vsDays == null) {
                return (
                  <View style={[styles.insightTip, { marginTop: 2 }]}>
                    <AppText size='small' color='muted'>
                      Dernier vide sanitaire non renseigné — prévoir 14 à 21 jours avant d&apos;installer le lot.
                    </AppText>
                  </View>
                );
              }
              if (vsDays <= 21) {
                return (
                  <View style={[styles.insightTip, { marginTop: 2 }]}>
                    <AppText size='small' color='muted'>
                      Dernier vide sanitaire il y a {vsDays} jour{vsDays > 1 ? 's' : ''} — parfait (fenêtre idéale 14–21 j).
                    </AppText>
                  </View>
                );
              }
              return (
                <View style={[styles.insightTip, { marginTop: 2 }]}>
                  <AppText size='small' color={palette.amber[700]}>
                    Vide sanitaire datant de {vsDays} jours — prévoir 14 à 21 jours de vide avant d&apos;installer le lot.
                  </AppText>
                </View>
              );
            })()}
          </View>
        )}

        {(buildingsQuery.data?.length ?? 0) === 0 && (
          <AppText size='small' color='muted'>
            Aucun bâtiment enregistré — créez-en un depuis l&apos;accueil avant de créer un lot.
          </AppText>
        )}
      </Field>

      <PickerModal
        visible={showBuildingPicker}
        onClose={() => setShowBuildingPicker(false)}
        title='Bâtiment disponible'
        options={buildingOptions}
        selectedId={selectedBuildingId}
        onSelect={(id) => {
          setSelectedBuildingId(id);
          setShowBuildingPicker(false);
        }}
      />

      {/* ── HACCP : Traçabilité ── */}
      <SectionTitle label='Traçabilité HACCP — très important' />
      <View style={styles.haccpNote}>
        <View style={styles.buildingInsightHeader}>
          <ShieldCheck size={14} color={palette.brand[600]} />
          <AppText size='small' weight='bold' color='brand'>Pourquoi renseigner ces informations ?</AppText>
        </View>
        <AppText size='small' color='muted'>
          • Suivi complet du lot : du couvoir jusqu&apos;à la vente au client{'\n'}
          • Génération automatique des PDF : reçus de vente, bordereaux, passeport sanitaire du lot{'\n'}
          • Aliments et intrants tracés — transparence et image professionnelle{'\n'}
          • Repris automatiquement dans les rapports et PDF : aucune ressaisie
        </AppText>
      </View>

      <Field label='Fournisseur couvoir'>
        <TextInput value={couvoirSupplier} onChangeText={setCouvoirSupplier} placeholder='Ex : Couvoir agro' />
      </Field>
      <Field label='N° lot poussins'>
        <TextInput value={chickLotNumber} onChangeText={setChickLotNumber} placeholder='Ex : LOT-2026-089' />
      </Field>
      <Field label="Date d'éclosion">
        <Pressable onPress={() => setShowHatchPicker(true)} style={styles.dateBtn}>
          <AppText size='body' color={hatchDate ? 'text' : 'faint'}>
            {hatchDate ? fmtDate(hatchDate) : 'Sélectionner...'}
          </AppText>
        </Pressable>
        {showHatchPicker && (
          <DateTimePicker value={hatchDate ?? new Date()} mode='date'
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onHatchDateChange} maximumDate={new Date()} locale='fr-FR' />
        )}
      </Field>
      <Field label='Prix poussin (FCFA)'>
        <TextInput value={chickUnitPrice} onChangeText={setChickUnitPrice} placeholder='Ex : 1500' keyboardType='numeric' />
      </Field>

      {/* ── Running lot: Review summary ── */}
      {isRunning && (
        <View style={styles.reviewCard}>
          <View style={styles.reviewHeader}>
            <Check size={16} color={palette.green[600]} />
            <AppText size='body' weight='bold' color='text'>Récapitulatif du lot</AppText>
          </View>
          <View style={styles.reviewGrid}>
            <ReviewRow label='Nom' value={batchName || '—'} />
            <ReviewRow label='Type' value={type === 'CHAIR' ? '🐔 Chair' : '🥚 Pondeuse'} />
            <ReviewRow label='Espèce' value={isAutre ? customSpecies.trim() || '—' : SPECIES_LABEL[species]} />
            <ReviewRow label='Souche' value={isAutre ? customBreed.trim() || '—' : (selectedBreed ? `${selectedBreed.name}${selectedBreed.refCode ? ` (${selectedBreed.refCode})` : ''}` : '—')} />
            <ReviewRow label='Bâtiment' value={selectedBuilding?.name ?? '—'} />
            <ReviewRow label={isRunning ? 'Date de mise en place' : "Date d'arrivée"} value={fmtDate(integrationDate)} />
            <ReviewRow label='Âge du lot' value={currentAgeDays > 0 ? formatAge(currentAgeDays) : '—'} />
            <ReviewRow label="Quantité d'origine" value={quantityAtStart ? `${parseInt(quantityAtStart, 10).toLocaleString('fr-FR')} oiseaux` : '—'} />
            <ReviewRow label='Effectif vivant' value={quantityAlive ? `${parseInt(quantityAlive, 10).toLocaleString('fr-FR')} oiseaux` : '—'} />
            {quantityAtStart.trim() && quantityAlive.trim() && parseInt(quantityAtStart, 10) > 0 && (
              <ReviewRow
                label='Mortalité'
                value={`${Math.max(0, parseInt(quantityAtStart, 10) - parseInt(quantityAlive, 10)).toLocaleString('fr-FR')} (${((1 - parseInt(quantityAlive, 10) / parseInt(quantityAtStart, 10)) * 100).toFixed(1)}%)`}
                danger={parseInt(quantityAlive, 10) / parseInt(quantityAtStart, 10) < 0.9}
              />
            )}
            {couvoirSupplier.trim() && <ReviewRow label='Couvoir' value={couvoirSupplier.trim()} />}
            {chickLotNumber.trim() && <ReviewRow label='N° lot poussins' value={chickLotNumber.trim()} />}
            {hatchDate && <ReviewRow label="Date d'éclosion" value={fmtDate(hatchDate)} />}
            {chickUnitPrice.trim() && <ReviewRow label='Prix poussin' value={`${parseInt(chickUnitPrice, 10).toLocaleString('fr-FR')} FCFA`} />}
          </View>
          {quantityAtStart.trim() && quantityAlive.trim() && parseInt(quantityAtStart, 10) > 0 && parseInt(quantityAlive, 10) / parseInt(quantityAtStart, 10) < 0.85 && (
            <View style={styles.reviewWarn}>
              <AlertTriangle size={14} color={palette.amber[600]} />
              <AppText size='small' color='amber'>
                mortalité supérieure à 15 % — vérifiez les données avant de créer le lot.
              </AppText>
            </View>
          )}
        </View>
      )}

      {/* ── Submit ── */}
      <View style={styles.submitArea}>
        {createMutation.isError && (
          <AppText size='small' color='danger'>
            {(createMutation.error as Error).message ?? 'Erreur lors de la création'}
          </AppText>
        )}
        <Button
          label={createMutation.isPending ? 'Création…' : 'Créer le lot'}
          tone='brand'
          onPress={onSubmit}
          disabled={!canSubmit || createMutation.isPending}
        />
      </View>
    </Sheet>
  );
}

// ── Helpers ──

function addWeeks(d: Date, weeks: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR');
}

function AdvisoryTile({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <View style={styles.advisoryTile}>
      <Icon size={12} color={palette.brand[500]} />
      <AppText size='small' color='faint'>{label}</AppText>
      <AppText size='small' weight='bold' color='text'>{value}</AppText>
    </View>
  );
}

interface PickerOption {
  id: string;
  label: string;
  hint?: string;
  image?: ImageSourcePropType;
  disabled?: boolean;
}

function PickerModal({ visible, onClose, title, options, selectedId, onSelect }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: PickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
      <Pressable style={styles.pickerBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerPanel}>
          <View style={styles.pickerHeader}>
            <AppText size='body' weight='bold' color='ink'>{title}</AppText>
            <Pressable onPress={onClose} hitSlop={10}>
              <AppText size='small' weight='bold' color='brand'>Fermer</AppText>
            </Pressable>
          </View>
          <ScrollView bounces={false} style={{ maxHeight: 380 }}>
            {options.map((o) => {
              const active = o.id === selectedId;
              return (
                <Pressable key={o.id} disabled={o.disabled}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onSelect(o.id); onClose(); }}
                  style={[styles.pickerRow, o.disabled && styles.pickerRowDisabled, active && styles.pickerRowActive]}>
                  {o.image ? <Image source={o.image} style={styles.pickerThumb} resizeMode='contain' /> : null}
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText size='body' weight={active ? 'bold' : 'medium'}
                      color={o.disabled ? 'faint' : active ? 'brand' : 'text'}>
                      {o.label}
                    </AppText>
                    {o.hint ? (
                      <AppText size='small' color={o.disabled ? 'faint' : 'muted'}>{o.hint}</AppText>
                    ) : null}
                  </View>
                  {active && <Check size={18} color={palette.brand[600]} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.insightRow}>
      <AppText size='small' color='faint'>{label}</AppText>
      <AppText size='small' weight='bold' color='text'>{value}</AppText>
    </View>
  );
}

function ReviewRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.reviewRow}>
      <AppText size='small' color='muted'>{label}</AppText>
      <AppText size='small' weight='bold' color={danger ? 'danger' : 'text'}>{value}</AppText>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText size='small' weight='bold' color='ink'>{label}</AppText>
      {children}
    </View>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleBar} />
      <AppText size='body' weight='bold' color='brand'>{label}</AppText>
    </View>
  );
}

function TextInput({ value, onChangeText, placeholder, keyboardType, style }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'numeric'; style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputWrap, focused && styles.inputWrapFocused, style]}>
      <RNTextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={color.ink[300]} keyboardType={keyboardType} style={styles.input}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  /* ── Running lot mode toggle (segmented control) ── */
  modeRow: {
    flexDirection: 'row', gap: 4, padding: 3, marginBottom: 10,
    borderRadius: radii.pill, backgroundColor: palette.surfaceAlt,
    borderWidth: 1, borderColor: color.border,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: radii.pill,
  },
  modeBtnActive: {
    backgroundColor: palette.brand[600],
    shadowColor: palette.brand[800], shadowOpacity: 0.28,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  modeBtnActiveRun: {
    backgroundColor: palette.amber[500],
    shadowColor: palette.amber[700], shadowOpacity: 0.28,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  runningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: palette.amber[50], borderRadius: radii.md, borderWidth: 1, borderColor: palette.amber[200],
  },
  runningInsight: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, padding: 8,
    backgroundColor: palette.surfaceAlt, borderRadius: radii.md,
  },
  /* ── Lot type segmented control ── */
  typeRow: {
    flexDirection: 'row', gap: 3, padding: 3,
    borderRadius: radii.pill, backgroundColor: palette.surfaceAlt,
    borderWidth: 1, borderColor: color.border,
  },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  speciesCarouselContent: { gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  speciesDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
  },
  speciesDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.ink[200],
  },
  speciesDotActive: {
    width: 16,
  },
  speciesCard: {
    width: 116, borderRadius: radii.lg, overflow: 'hidden',
    backgroundColor: palette.surface, borderWidth: 2, borderColor: color.border,
  },
  speciesCardImg: { width: '100%', height: 84 },
  speciesCardImgShiftLeft: { transform: [{ scale: 0.84 }, { translateX: -18 }] },
  speciesCardImgShiftFaisan: { transform: [{ scale: 0.8 }, { translateX: -18 }, { translateY: 6 }] },
  speciesCardPlaceholder: {
    width: '100%', height: 84, alignItems: 'center', justifyContent: 'center',
    backgroundColor: palette.brand[50],
  },
  speciesCardLabel: {
    paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center',
    backgroundColor: 'rgba(16, 34, 47, 0.72)',
  },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.md,
    backgroundColor: palette.surface, borderWidth: 1.5, borderColor: color.border,
  },
  selectedBreedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  refCodeChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: palette.brand[100],
  },
  breedInfo: {
    backgroundColor: palette.brand[50], borderRadius: radii.md, padding: 8, marginTop: 4,
    borderLeftWidth: 3, borderLeftColor: palette.brand[500],
  },
  customBreedInput: {
    borderRadius: radii.md, borderWidth: 1.5, borderColor: color.border,
    backgroundColor: palette.surface, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
    color: color.ink[900],
  },
  customBreedInputGap: { marginTop: 8 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.md,
    backgroundColor: palette.surface, borderWidth: 1.5, borderColor: color.border,
  },
  dateAgeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: radii.pill,
    backgroundColor: palette.brand[50],
  },
  fieldHint: { marginTop: 6 },
  feedMismatch: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    paddingVertical: 6, paddingHorizontal: 8, borderRadius: radii.md,
    backgroundColor: palette.amber[50], borderWidth: 1, borderColor: palette.amber[200],
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  sectionTitleBar: { width: 4, height: 16, borderRadius: 2, backgroundColor: palette.brand[500] },
  submitArea: {
    marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: palette.brand[100], gap: 12,
  },
  pickerBackdrop: {
    flex: 1, backgroundColor: 'rgba(9, 24, 40, 0.45)', justifyContent: 'center', padding: 24,
  },
  pickerPanel: {
    backgroundColor: palette.paper, borderRadius: radii.lg, padding: 16,
    maxHeight: 460, borderWidth: 1, borderColor: color.border,
  },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: radii.md, borderWidth: 1, borderColor: 'transparent',
  },
  pickerRowActive: { borderColor: palette.brand[200], backgroundColor: palette.brand[50] },
  pickerRowDisabled: { opacity: 0.5 },
  pickerThumb: {
    width: 44, height: 44, borderRadius: radii.md, backgroundColor: palette.brand[50],
  },
  selectedBreedThumb: {
    width: 34, height: 34, borderRadius: radii.sm, backgroundColor: palette.brand[50],
  },
  field: { gap: 6 },
  inputWrap: {
    borderWidth: 1.5, borderColor: color.border, borderRadius: radii.md, backgroundColor: palette.surface,
  },
  inputWrapFocused: { borderColor: palette.brand[500], backgroundColor: palette.surface },
  input: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: color.ink[900] },
  /* ── Building insight card ── */
  buildingInsight: {
    backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[100],
    borderRadius: radii.lg, padding: 14, gap: 8, marginTop: 6,
  },
  buildingInsightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  insightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  insightWarn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  insightTip: { borderRadius: radii.md, padding: 8, backgroundColor: palette.surface },
  haccpNote: {
    backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[100],
    borderRadius: radii.lg, padding: 12, gap: 6, marginBottom: 4,
  },
  /* ── Advisory card ── */
  advisoryCard: {
    backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[100],
    borderRadius: radii.lg, padding: 14, gap: 12,
  },
  advisoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  projectionBadge: {
    backgroundColor: palette.brand[100], borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3,
  },
  projectionNote: {
    borderTopWidth: 1, borderTopColor: palette.brand[100], paddingTop: 8,
  },
  advisoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  advisoryTile: {
    flexBasis: '45%', flexGrow: 1, gap: 2, backgroundColor: palette.surface,
    borderRadius: radii.md, padding: 8, borderWidth: 1, borderColor: palette.brand[100],
  },
  timeline: { gap: 8 },
  timelineStep: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineDotStart: { backgroundColor: palette.green[500] },
  timelineDotMid: { backgroundColor: palette.brand[400] },
  timelineDotEnd: { backgroundColor: palette.amber[500] },
  lifecycleNote: {
    backgroundColor: palette.surface, borderRadius: radii.md, padding: 10, gap: 4,
    borderWidth: 1, borderColor: palette.brand[100],
  },
  /* ── Running lot: feed phase suggest button ── */
  suggestBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, padding: 8,
    backgroundColor: palette.amber[50], borderRadius: radii.md, borderWidth: 1, borderColor: palette.amber[200],
  },
  /* ── Running lot: treatment checklist ── */
  treatmentInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, marginBottom: 4,
    backgroundColor: palette.brand[50], borderRadius: radii.md,
  },
  treatmentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginBottom: 6,
    backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: 1.5, borderColor: color.border,
  },
  treatmentRowDone: {
    borderColor: palette.brand[300], backgroundColor: palette.brand[50],
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: color.ink[300],
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: palette.brand[600], borderColor: palette.brand[600],
  },
  treatmentSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, marginTop: 4,
    backgroundColor: palette.green[50], borderRadius: radii.md, borderWidth: 1, borderColor: palette.green[200],
  },
  /* ── Running lot: age advisory ── */
  ageAdvisoryCard: {
    backgroundColor: palette.brand[50], borderWidth: 1, borderColor: palette.brand[100],
    borderRadius: radii.lg, padding: 14, gap: 10, marginTop: 8,
  },
  advisoryItem: {
    flexDirection: 'row', gap: 10, padding: 8, backgroundColor: palette.surface, borderRadius: radii.md,
    borderWidth: 1, borderColor: palette.brand[100],
  },
  /* ── Running lot review card ── */
  reviewCard: {
    backgroundColor: palette.surfaceAlt, borderWidth: 1.5, borderColor: palette.green[200],
    borderRadius: radii.lg, padding: 14, gap: 10, marginTop: 8,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewGrid: { gap: 6 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reviewWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4,
    backgroundColor: palette.amber[50], borderRadius: radii.md, padding: 8,
    borderWidth: 1, borderColor: palette.amber[200],
  },
});
