#pragma once

#include "motis/core/access/time_access.h"
#include "motis/core/access/trip_access.h"
#include "motis/core/conv/event_type_conv.h"
#include "motis/core/journey/extern_trip.h"
#include "motis/protocol/TripId_generated.h"

namespace motis {

inline concrete_trip from_fbs(schedule const& sched, TripId const* t,
                              bool const fuzzy = false) {
  return get_trip(sched, t->station_id()->str(), t->train_nr(), t->time(),
                  t->target_station_id()->str(), t->target_time(),
                  t->line_id()->str(), fuzzy);
}

inline flatbuffers::Offset<TripId> to_fbs(schedule const& sched,
                                          flatbuffers::FlatBufferBuilder& fbb,
                                          concrete_trip const& trp) {
  auto const& p = trp.trp_->id_.primary_;
  auto const& s = trp.trp_->id_.secondary_;
  return CreateTripId(
      fbb, fbb.CreateString(sched.stations_.at(p.station_id_)->eva_nr_),
      p.train_nr_, motis_to_unixtime(sched, trp.get_first_dep_time()),
      fbb.CreateString(sched.stations_.at(s.target_station_id_)->eva_nr_),
      motis_to_unixtime(sched, trp.get_last_arr_time()),
      fbb.CreateString(s.line_id_));
}

inline flatbuffers::Offset<TripId> to_fbs(flatbuffers::FlatBufferBuilder& fbb,
                                          extern_trip const& t) {
  return CreateTripId(fbb, fbb.CreateString(t.station_id_), t.train_nr_,
                      t.time_, fbb.CreateString(t.target_station_id_),
                      t.target_time_, fbb.CreateString(t.line_id_));
}

inline concrete_trip from_extern_trip(schedule const& sched,
                                      extern_trip const* t) {
  return get_trip(sched, t->station_id_, t->train_nr_, t->time_,
                  t->target_station_id_, t->target_time_, t->line_id_);
}

inline extern_trip to_extern_trip(schedule const& sched,
                                  concrete_trip const& t) {
  return extern_trip{
      sched.stations_.at(t.trp_->id_.primary_.station_id_)->eva_nr_,
      t.trp_->id_.primary_.train_nr_,
      motis_to_unixtime(sched, t.get_first_dep_time()),
      sched.stations_.at(t.trp_->id_.secondary_.target_station_id_)->eva_nr_,
      motis_to_unixtime(sched, t.get_last_arr_time()),
      t.trp_->id_.secondary_.line_id_};
}

inline extern_trip to_extern_trip(TripId const* trp) {
  return extern_trip{trp->station_id()->str(),
                     trp->train_nr(),
                     trp->time(),
                     trp->target_station_id()->str(),
                     trp->target_time(),
                     trp->line_id()->str()};
}

}  // namespace motis
