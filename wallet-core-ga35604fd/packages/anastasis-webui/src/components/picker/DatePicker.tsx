/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 *
 * @author Sebastian Javier Marchano (sebasjm)
 */

import { h, Component } from "preact";

interface Props {
  closeFunction?: () => void;
  dateReceiver?: (d: Date) => void;
  initialDate?: Date;
  years?: Array<number>;
  opened?: boolean;
}
interface State {
  displayedMonth: number;
  displayedYear: number;
  selectYearMode: boolean;
  currentDate: Date;
}
const now = new Date();

const monthArrShortFull = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const monthArrShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const dayArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const yearArr: number[] = [];

// inspired by https://codepen.io/m4r1vs/pen/MOOxyE
export class DatePicker extends Component<Props, State> {
  closeDatePicker() {
    this.props.closeFunction && this.props.closeFunction(); // Function gets passed by parent
  }

  /**
   * Gets fired when a day gets clicked.
   * @param {object} e The event thrown by the <span /> element clicked
   */
  dayClicked(e: any) {
    const element = e.target; // the actual element clicked

    if (element.innerHTML === "") return false; // don't continue if <span /> empty

    // get date from clicked element (gets attached when rendered)
    const date = new Date(element.getAttribute("data-value"));

    // update the state
    this.setState({ currentDate: date });
    this.passDateToParent(date);
  }

  /**
   * returns days in month as array
   * @param {number} month the month to display
   * @param {number} year the year to display
   */
  getDaysByMonth(month: number, year: number) {
    const calendar = [];

    const date = new Date(year, month, 1); // month to display

    const firstDay = new Date(year, month, 1).getDay(); // first weekday of month
    const lastDate = new Date(year, month + 1, 0).getDate(); // last date of month

    let day: number | null = 0;

    // the calendar is 7*6 fields big, so 42 loops
    for (let i = 0; i < 42; i++) {
      if (i >= firstDay && day !== null) day = day + 1;
      if (day !== null && day > lastDate) day = null;

      // append the calendar Array
      calendar.push({
        day: day === 0 || day === null ? null : day, // null or number
        date: day === 0 || day === null ? null : new Date(year, month, day), // null or Date()
        today:
          day === now.getDate() &&
          month === now.getMonth() &&
          year === now.getFullYear(), // boolean
      });
    }

    return calendar;
  }

  /**
   * Display previous month by updating state
   */
  displayPrevMonth() {
    if (this.state.displayedMonth <= 0) {
      this.setState({
        displayedMonth: 11,
        displayedYear: this.state.displayedYear - 1,
      });
    } else {
      this.setState({
        displayedMonth: this.state.displayedMonth - 1,
      });
    }
  }

  /**
   * Display next month by updating state
   */
  displayNextMonth() {
    if (this.state.displayedMonth >= 11) {
      this.setState({
        displayedMonth: 0,
        displayedYear: this.state.displayedYear + 1,
      });
    } else {
      this.setState({
        displayedMonth: this.state.displayedMonth + 1,
      });
    }
  }

  /**
   * Display the selected month (gets fired when clicking on the date string)
   */
  displaySelectedMonth() {
    if (this.state.selectYearMode) {
      this.toggleYearSelector();
    } else {
      if (!this.state.currentDate) return false;
      this.setState({
        displayedMonth: this.state.currentDate.getMonth(),
        displayedYear: this.state.currentDate.getFullYear(),
      });
    }
  }

  toggleYearSelector() {
    this.setState({ selectYearMode: !this.state.selectYearMode });
  }

  changeDisplayedYear(e: any) {
    const element = e.target;
    this.toggleYearSelector();
    this.setState({
      displayedYear: parseInt(element.innerHTML, 10),
      displayedMonth: 0,
    });
  }

  /**
   * Pass the selected date to parent when 'OK' is clicked
   */
  passSavedDateDateToParent() {
    this.passDateToParent(this.state.currentDate);
  }
  passDateToParent(date: Date) {
    if (typeof this.props.dateReceiver === "function")
      this.props.dateReceiver(date);
    this.closeDatePicker();
  }

  componentDidUpdate() {
    // if (this.state.selectYearMode) {
    //   document.getElementsByClassName('selected')[0].scrollIntoView(); // works in every browser incl. IE, replace with scrollIntoViewIfNeeded when browsers support it
    // }
  }

  constructor(props: any) {
    super(props);

    this.closeDatePicker = this.closeDatePicker.bind(this);
    this.dayClicked = this.dayClicked.bind(this);
    this.displayNextMonth = this.displayNextMonth.bind(this);
    this.displayPrevMonth = this.displayPrevMonth.bind(this);
    this.getDaysByMonth = this.getDaysByMonth.bind(this);
    this.changeDisplayedYear = this.changeDisplayedYear.bind(this);
    this.passDateToParent = this.passDateToParent.bind(this);
    this.toggleYearSelector = this.toggleYearSelector.bind(this);
    this.displaySelectedMonth = this.displaySelectedMonth.bind(this);

    const initial = props.initialDate || now;

    this.state = {
      currentDate: initial,
      displayedMonth: initial.getMonth(),
      displayedYear: initial.getFullYear(),
      selectYearMode: false,
    };
  }

  render() {
    const {
      currentDate,
      displayedMonth,
      displayedYear,
      selectYearMode,
    } = this.state;

    return (
      <div>
        <div class={`datePicker ${this.props.opened && "datePicker--opened"}`}>
          <div class="datePicker--titles">
            <h3
              style={{
                color: selectYearMode
                  ? "rgba(255,255,255,.87)"
                  : "rgba(255,255,255,.57)",
              }}
              onClick={this.toggleYearSelector}
            >
              {currentDate.getFullYear()}
            </h3>
            <h2
              style={{
                color: !selectYearMode
                  ? "rgba(255,255,255,.87)"
                  : "rgba(255,255,255,.57)",
              }}
              onClick={this.displaySelectedMonth}
            >
              {dayArr[currentDate.getDay()]},{" "}
              {monthArrShort[currentDate.getMonth()]} {currentDate.getDate()}
            </h2>
          </div>

          {!selectYearMode && (
            <nav>
              <span onClick={this.displayPrevMonth} class="icon">
                <i
                  style={{ transform: "rotate(180deg)" }}
                  class="mdi mdi-forward"
                />
              </span>
              <h4>
                {monthArrShortFull[displayedMonth]} {displayedYear}
              </h4>
              <span onClick={this.displayNextMonth} class="icon">
                <i class="mdi mdi-forward" />
              </span>
            </nav>
          )}

          <div class="datePicker--scroll">
            {!selectYearMode && (
              <div class="datePicker--calendar">
                <div class="datePicker--dayNames">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
                    <span key={i}>{day}</span>
                  ))}
                </div>

                <div onClick={this.dayClicked} class="datePicker--days">
                  {/*
                  Loop through the calendar object returned by getDaysByMonth().
                */}

                  {this.getDaysByMonth(
                    this.state.displayedMonth,
                    this.state.displayedYear,
                  ).map((day) => {
                    let selected = false;

                    if (currentDate && day.date)
                      selected =
                        currentDate.toLocaleDateString() ===
                        day.date.toLocaleDateString();

                    return (
                      <span
                        key={day.day}
                        class={
                          (day.today ? "datePicker--today " : "") +
                          (selected ? "datePicker--selected" : "")
                        }
                        disabled={!day.date}
                        data-value={day.date}
                      >
                        {day.day}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {selectYearMode && (
              <div class="datePicker--selectYear">
                {(this.props.years || yearArr).map((year) => (
                  <span
                    key={year}
                    class={year === displayedYear ? "selected" : ""}
                    onClick={this.changeDisplayedYear}
                  >
                    {year}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          class="datePicker--background"
          onClick={this.closeDatePicker}
          style={{
            display: this.props.opened ? "block" : "none",
          }}
        />
      </div>
    );
  }
}

for (let i = 2010; i <= now.getFullYear() + 10; i++) {
  yearArr.push(i);
}
