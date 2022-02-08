import { PrimitiveAtom, useAtom } from "jotai";
import { focusAtom } from "jotai/optics";
import { cloneDeep } from "lodash-es";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Control,
  Controller,
  UseFormRegister,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { useQueryClient } from "react-query";

import {
  queryKeys as lookupQueryKeys,
  sendLookupRiBasisRequest,
} from "../../api/lookup";
import { queryKeys } from "../../api/paxmon";
import { TripServiceInfo } from "../../api/protocol/motis";
import { PaxMonStatusResponse } from "../../api/protocol/motis/paxmon";
import {
  RiBasisFahrtData,
  RiBasisZeitstatus,
} from "../../api/protocol/motis/ribasis";

import { MeasureUnion, isRtUpdateMeasureU } from "../../data/measures";
import {
  StopFormData,
  getEmptySectionFormData,
  getEmptyStation,
  getNewEventFormData,
  getNewStopTimes,
  toFormData,
  toRiBasis,
} from "../../data/rtMeasureFormData";
import { scheduleAtom } from "../../data/simulation";

import StationPicker from "../StationPicker";
import TripPicker from "../TripPicker";
import TimeInput from "./TimeInput";

export type RtUpdateMeasureEditorProps = {
  measureAtom: PrimitiveAtom<MeasureUnion>;
};

const labelClass = "font-semibold";

const rtReasons: Array<{ reason: RiBasisZeitstatus; label: string }> = [
  { reason: "FAHRPLAN", label: "Planmäßig" },
  { reason: "MELDUNG", label: "Ist-Meldung" },
  { reason: "PROGNOSE", label: "Prognose" },
];

function RtUpdateMeasureEditor({
  measureAtom,
}: RtUpdateMeasureEditorProps): JSX.Element {
  const dataAtom = useMemo(
    () =>
      focusAtom(measureAtom, (optic) =>
        optic.guard(isRtUpdateMeasureU).prop("data")
      ),
    [measureAtom]
  );
  const [data, setData] = useAtom(dataAtom);
  const queryClient = useQueryClient();
  const [schedule] = useAtom(scheduleAtom); // TODO: rerender...
  const renderCount = useRef(0);
  const [selectedTrip, setSelectedTrip] = useState<string>();
  const [allowReroute, setAllowReroute] = useState(true);

  if (!data) {
    throw new Error("invalid measure editor");
  }

  const setRiBasis = (ribasis: RiBasisFahrtData) =>
    setData((d) => {
      return { ...d, ribasis };
    });

  const setTrip = async (tsi: TripServiceInfo | undefined) => {
    setData((d) => {
      return { ...d, trip: tsi };
    });
    if (tsi) {
      const lookupReq = { trip_id: tsi.trip, schedule };
      const data = await queryClient.fetchQuery(
        lookupQueryKeys.riBasis(lookupReq),
        () => sendLookupRiBasisRequest(lookupReq),
        { staleTime: 1000 }
      );
      console.log(`received ri basis: ${data.trips.length} trips`);
      const requestedTripId = JSON.stringify(tsi.trip);
      const tripData = data.trips.filter(
        (t) => JSON.stringify(t.trip_id) === requestedTripId
      );
      if (tripData.length === 1) {
        setData((d) => {
          return { ...d, ribasis: tripData[0].fahrt.data };
        });
        setSelectedTrip(requestedTripId);
        setAllowReroute(data.trips.length === 1);
      } else {
        console.log("no ri basis for requested trip received");
      }
    }
  };

  useEffect(() => {
    console.log("RtUpdateMeasureEditor mounted");
    return () => {
      console.log("RtUpdateMeasureEditor unmounted");
    };
  }, []);

  return (
    <div>
      <div>
        <div>RtUpdateMeasureEditor Render Count: {++renderCount.current}</div>
        <div className={labelClass}>Trip</div>
        <div>
          <TripPicker
            onTripPicked={setTrip}
            clearOnPick={false}
            longDistanceOnly={false}
            initialTrip={data.trip}
          />
        </div>
      </div>
      {data.ribasis ? (
        <div>
          <TripSectionEditor
            ribasis={data.ribasis}
            key={selectedTrip}
            onSetData={setRiBasis}
            allowReroute={allowReroute}
          />
        </div>
      ) : null}
    </div>
  );
}

type TripSectionEditorProps = {
  ribasis: RiBasisFahrtData;
  onSetData: (data: RiBasisFahrtData) => void;
  allowReroute: boolean;
};

type FormInputs = { stops: StopFormData[] };

function TripSectionEditor({
  ribasis,
  onSetData,
  allowReroute,
}: TripSectionEditorProps): JSX.Element {
  const defaultValues = useMemo(() => {
    return { stops: toFormData(ribasis) };
  }, [ribasis]);
  const { register, control, handleSubmit, getValues } = useForm<FormInputs>({
    defaultValues,
  });
  const { fields, insert, remove } = useFieldArray({
    name: "stops",
    control,
  });
  const renderCount = useRef(0);
  const queryClient = useQueryClient();

  const onSubmit = (data: FormInputs) => {
    console.log("submitted form:", data);
    const newRiBasis = toRiBasis(ribasis, data.stops);
    console.log("ri basis:", newRiBasis, JSON.stringify(newRiBasis, null, 2));
    onSetData(newRiBasis);
  };

  const insertStop = (index: number) => {
    const systemTime = queryClient.getQueryData<PaxMonStatusResponse>(
      queryKeys.status(0)
    )?.system_time;
    const fallbackTime = systemTime ? new Date(systemTime * 1000) : new Date();
    const previousStop =
      index > 0 ? getValues(`stops.${index - 1}`) : undefined;
    const nextStop =
      index < fields.length ? getValues(`stops.${index}`) : undefined;

    const {
      scheduleArrival,
      scheduleDeparture,
      currentArrival,
      currentDeparture,
    } = getNewStopTimes(previousStop, nextStop, fallbackTime);
    insert(index, {
      station: getEmptyStation(),
      arrival: getNewEventFormData(scheduleArrival, currentArrival),
      departure: getNewEventFormData(scheduleDeparture, currentDeparture),
      section: previousStop
        ? cloneDeep(previousStop.section)
        : nextStop
        ? cloneDeep(nextStop.section)
        : getEmptySectionFormData(),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>TripSectionEditor Render Count: {++renderCount.current}</div>
      <div className="flex flex-col gap-4">
        {allowReroute ? (
          <div>
            <button
              type="button"
              className="px-2 py-1 bg-db-red-500 hover:bg-db-red-600 text-white text-xs rounded"
              onClick={() => insertStop(0)}
            >
              Neuen Halt am Anfang einfügen
            </button>
          </div>
        ) : (
          <div>
            <strong>Hinweis:</strong> Dieser Zug ist an Vereinigungen und/oder
            Durchbindungen beteiligt. Änderungen an der Haltefolge, Gleisen und
            Fahrgastwechselerlaubnis sind nicht möglich.
          </div>
        )}
        {fields.map((field, index) => {
          const isLastStop = index === fields.length - 1;
          const hasArrival = index !== 0;
          const hasDeparture = !isLastStop || fields.length === 1;

          return (
            <div key={field.id} className="bg-db-cool-gray-300">
              <label>
                <span>Station:</span>
                {allowReroute ? (
                  <Controller
                    control={control}
                    name={`stops.${index}.station` as const}
                    render={({ field: { onChange, value } }) => (
                      <StationPicker
                        onStationPicked={onChange}
                        initialStation={value}
                        clearOnPick={false}
                      />
                    )}
                  />
                ) : (
                  <div>{field.station.name}</div>
                )}
              </label>
              <fieldset
                className="flex justify-between"
                disabled={!allowReroute}
              >
                {hasArrival && (
                  <label>
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-offset-0 focus:ring-blue-200 focus:ring-opacity-50"
                      {...register(
                        `stops.${index}.arrival.interchange` as const
                      )}
                    />
                    <span className="ml-2">Ausstieg möglich</span>
                  </label>
                )}
                {hasDeparture && (
                  <label>
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-offset-0 focus:ring-blue-200 focus:ring-opacity-50"
                      {...register(
                        `stops.${index}.departure.interchange` as const
                      )}
                    />
                    <span className="ml-2">Einstieg möglich</span>
                  </label>
                )}
              </fieldset>
              {hasArrival && (
                <div>
                  <div>Ankunft:</div>
                  <EventEditor
                    register={register}
                    control={control}
                    index={index}
                    allowReroute={allowReroute}
                    eventType="arrival"
                  />
                </div>
              )}
              {hasDeparture && (
                <div>
                  <div>Abfahrt:</div>
                  <EventEditor
                    register={register}
                    control={control}
                    index={index}
                    allowReroute={allowReroute}
                    eventType="departure"
                  />
                </div>
              )}
              {hasDeparture && (
                <div className="flex flex-row gap-2">
                  <label>
                    <span>Gattung:</span>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      {...register(`stops.${index}.section.category` as const, {
                        required: true,
                      })}
                    />
                  </label>
                  <label>
                    <span>Zugnr.:</span>
                    <input
                      type="number"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      {...register(`stops.${index}.section.trainNr` as const, {
                        required: true,
                        valueAsNumber: true,
                      })}
                    />
                  </label>
                  <label>
                    <span>Linie:</span>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                      {...register(`stops.${index}.section.line` as const)}
                    />
                  </label>
                </div>
              )}
              {allowReroute && (
                <>
                  <div>
                    <button
                      type="button"
                      className="px-2 py-1 bg-db-red-500 hover:bg-db-red-600 text-white text-xs rounded"
                      onClick={() => remove(index)}
                    >
                      Halt entfernen
                    </button>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="px-2 py-1 bg-db-red-500 hover:bg-db-red-600 text-white text-xs rounded"
                      onClick={() => insertStop(index + 1)}
                    >
                      {isLastStop
                        ? "Neuen Halt am Ende einfügen"
                        : "Neuen Zwischenhalt einfügen"}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div>
          <button
            type="submit"
            className="px-2 py-1 bg-db-red-500 hover:bg-db-red-600 text-white text-xs rounded"
          >
            Änderungen speichern
          </button>
        </div>
      </div>
    </form>
  );
}

type EventEditorProps = {
  register: UseFormRegister<FormInputs>;
  control: Control<FormInputs>;
  index: number;
  eventType: "arrival" | "departure";
  allowReroute: boolean;
};

function EventEditor({
  register,
  control,
  index,
  eventType,
  allowReroute,
}: EventEditorProps): JSX.Element {
  return (
    <>
      <div>
        <span>Planmäßig:</span>
        <div className="flex gap-2">
          <label className="flex-1">
            <span>
              {eventType == "arrival" ? "Abfahrtszeit" : "Ankunftszeit"}
            </span>
            <Controller
              control={control}
              name={`stops.${index}.${eventType}.scheduleTime` as const}
              render={({ field }) => (
                <TimeInput
                  {...field}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
              )}
              rules={{ required: true }}
            />
          </label>
          <label className="flex-1">
            <span>Gleis</span>
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              readOnly={!allowReroute}
              {...register(
                `stops.${index}.${eventType}.scheduleTrack` as const
              )}
            />
          </label>
        </div>
      </div>
      <div>
        <span>Echtzeit:</span>
        <div>
          <select
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            {...register(`stops.${index}.${eventType}.reason` as const, {
              required: true,
            })}
          >
            {rtReasons.map((r) => (
              <option key={r.reason} value={r.reason}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <label className="flex-1">
            <span>
              {eventType == "arrival" ? "Abfahrtszeit" : "Ankunftszeit"}
            </span>
            <Controller
              control={control}
              name={`stops.${index}.${eventType}.currentTime` as const}
              render={({ field }) => (
                <TimeInput
                  {...field}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
              )}
              rules={{ required: true }}
            />
          </label>
          <label className="flex-1">
            <span>Gleis</span>
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              readOnly={!allowReroute}
              {...register(`stops.${index}.${eventType}.currentTrack` as const)}
            />
          </label>
        </div>
      </div>
    </>
  );
}

export default RtUpdateMeasureEditor;