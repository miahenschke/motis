#include "motis/core/schedule/trip.h"

namespace motis {

time concrete_trip::get_first_dep_time() const {
  return {day_idx_, trp_->id_.primary_.first_departure_mam_};
}
time concrete_trip::get_last_arr_time() const {
  return {static_cast<day_idx_t>(day_idx_ +
                                 trp_->edges_->back()
                                     ->m_.route_edge_.conns_.at(trp_->lcon_idx_)
                                     .start_day_offset_),
          trp_->id_.secondary_.last_arrival_mam_};
}

}  // namespace motis