import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ListOrdered } from 'lucide-react';
import type { League } from '../domain/types';
import { countryDisplay, type CountryDisplay } from '../utils/countries';

/**
 * Bandera del país como imagen (Windows no renderiza los emoji de bandera);
 * si no hay o no carga, el emoji de reserva en su mismo hueco.
 */
export const CountryFlag: React.FC<{ display: CountryDisplay }> = ({
  display,
}) => {
  const [failed, setFailed] = useState(false);

  if (display.flagUrl === null || failed) {
    return (
      <span className="w-5 text-sm leading-none text-center shrink-0">
        {display.fallback}
      </span>
    );
  }
  return (
    <img
      src={display.flagUrl}
      alt=""
      width={20}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="w-5 rounded-[3px] shrink-0"
    />
  );
};

/**
 * Navegador de ligas al estilo sportsbook: una fila plegable por país
 * (bandera, nombre en español y nº de partidos) y, dentro, sus competiciones.
 * Elegir una liga filtra el listado; "Todos los partidos" abre el catálogo
 * completo del deporte.
 *
 * Los recuentos salen de la navegación del venue (`listLeagues`), así que la
 * pantalla entera se pinta sin descargar ni un partido.
 */
export const LeagueBrowser: React.FC<{
  leagues: League[];
  sportLabel: string;
  sportIcon: string | null;
  isLoading: boolean;
  onPickLeague: (league: League) => void;
  onBrowseAll: () => void;
}> = ({ leagues, sportLabel, sportIcon, isLoading, onPickLeague, onBrowseAll }) => {
  const [openCountries, setOpenCountries] = useState<Set<string>>(() => new Set());

  // País → sus ligas, ordenado por el nombre YA en español: el usuario ve
  // "Alemania" antes que "Arabia Saudí", no el orden del inglés original.
  const countries = useMemo(() => {
    const byCountry = new Map<string, League[]>();
    for (const league of leagues) {
      const group = byCountry.get(league.country) ?? [];
      group.push(league);
      byCountry.set(league.country, group);
    }
    return [...byCountry.entries()]
      .map(([country, group]) => ({
        country,
        display: countryDisplay(country),
        leagues: group,
        total: group.reduce((a, l) => a + (l.activeCount ?? 0), 0),
      }))
      .sort((a, b) => a.display.label.localeCompare(b.display.label, 'es'));
  }, [leagues]);

  const total = countries.reduce((a, c) => a + c.total, 0);

  const toggle = (country: string) =>
    setOpenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });

  if (isLoading && countries.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="h-12 rounded-xl bg-[#0d1017] border border-neutral-800/80 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Cabecera: el deporte entero y su total */}
      <div className="flex items-center gap-2 px-1 pb-1">
        {sportIcon !== null && <span className="text-base">{sportIcon}</span>}
        <h3 className="text-sm font-bold text-neutral-100">Todo {sportLabel}</h3>
        {total > 0 && (
          <span className="text-[10px] font-mono text-neutral-500">
            {total} partidos
          </span>
        )}
      </div>

      {/* Catálogo completo, para quien no busca un país concreto */}
      <button
        onClick={onBrowseAll}
        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/25 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-colors text-left"
      >
        <ListOrdered className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="flex-1 text-xs font-bold text-emerald-300">
          Todos los partidos
        </span>
        <span className="text-[10px] font-mono text-emerald-400/70">
          por hora de comienzo
        </span>
        <ChevronRight className="w-4 h-4 text-emerald-500/60 shrink-0" />
      </button>

      {countries.map(({ country, display, leagues: group, total: countryTotal }) => {
        const open = openCountries.has(country);
        return (
          <div
            key={country}
            className="rounded-xl bg-[#0d1017] border border-neutral-800/80 overflow-hidden"
          >
            <button
              onClick={() => toggle(country)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/30 transition-colors text-left"
            >
              <CountryFlag display={display} />
              <span className="flex-1 text-xs font-bold text-neutral-100 truncate">
                {display.label}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-neutral-800 text-[10px] font-mono font-bold text-neutral-300 shrink-0">
                {countryTotal}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-neutral-500 transition-transform shrink-0 ${
                  open ? '' : '-rotate-90'
                }`}
              />
            </button>

            {open && (
              <div className="border-t border-neutral-800/60 py-1">
                {group.map((league) => (
                  <button
                    key={`${league.country}:${league.id}`}
                    onClick={() => onPickLeague(league)}
                    className="w-full flex items-center gap-3 pl-11 pr-4 py-2.5 hover:bg-emerald-500/[0.06] transition-colors text-left group"
                  >
                    <span className="flex-1 text-xs font-semibold text-neutral-300 group-hover:text-emerald-300 truncate transition-colors">
                      {league.label}
                    </span>
                    {league.activeCount !== null && (
                      <span className="text-[10px] font-mono text-neutral-600 shrink-0">
                        {league.activeCount}
                      </span>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-neutral-700 group-hover:text-emerald-400 shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
